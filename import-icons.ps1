# ============================================================
#  TowerForge — import game icons
#  Copies PNGs from the assets folder into the client, trimmed to the
#  art (empty transparent border cut off), centered on a square canvas
#  and resized, so every icon fills its badge the same way.
#
#    powershell -File import-icons.ps1                       # all icons
#    powershell -File import-icons.ps1 -Source D:\icons      # other folder
#
#  Source layout: <Source>\Modules\*.png and <Source>\Bots\*.png.
#  File names become slugs: "Shrink Ray.png" / "Shrink_Ray_4.png" →
#  shrink-ray.png (trailing _N numbers are dropped). $Aliases maps
#  file names that differ from the in-app name.
# ============================================================

param(
    [string]$Source = "$env:USERPROFILE\Desktop\Tower-Forge-Assets",
    [int]$Size = 192,       # output width/height in px
    [double]$Margin = 0.02  # empty border kept around the art (fraction of its size)
)

Add-Type -AssemblyName System.Drawing

$Aliases = @{
    'restorative-boost' = 'restorative-bonus'
}

$Targets = @{
    'Modules' = "$PSScriptRoot\towerforge.client\src\assets\modules"
    'Bots'    = "$PSScriptRoot\towerforge.client\src\assets\bots"
}

function Get-Slug([string]$name) {
    $s = $name -replace '(_\d+)+$', ''
    $s = ($s -creplace '([a-z])([A-Z])', '$1 $2').ToLower()
    $s = ($s -replace '[^a-z0-9]+', '-').Trim('-')
    if ($Aliases.ContainsKey($s)) { $s = $Aliases[$s] }
    return $s
}

# Bounding box of the pixels that aren't (nearly) transparent.
function Get-ContentBounds([System.Drawing.Bitmap]$bmp) {
    $w = $bmp.Width; $h = $bmp.Height
    $rect = New-Object System.Drawing.Rectangle 0, 0, $w, $h
    $data = $bmp.LockBits($rect, [System.Drawing.Imaging.ImageLockMode]::ReadOnly, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $bytes = New-Object byte[] ($data.Stride * $h)
    [System.Runtime.InteropServices.Marshal]::Copy($data.Scan0, $bytes, 0, $bytes.Length)
    $bmp.UnlockBits($data)
    $minX = $w; $minY = $h; $maxX = -1; $maxY = -1
    for ($y = 0; $y -lt $h; $y++) {
        $row = $y * $data.Stride
        for ($x = 0; $x -lt $w; $x++) {
            if ($bytes[$row + $x * 4 + 3] -gt 40) {
                if ($x -lt $minX) { $minX = $x }; if ($x -gt $maxX) { $maxX = $x }
                if ($y -lt $minY) { $minY = $y }; if ($y -gt $maxY) { $maxY = $y }
            }
        }
    }
    if ($maxX -lt 0) { return $rect }
    return New-Object System.Drawing.Rectangle $minX, $minY, ($maxX - $minX + 1), ($maxY - $minY + 1)
}

foreach ($kind in $Targets.Keys) {
    $dir = Join-Path $Source $kind
    if (-not (Test-Path $dir)) { continue }
    $out = $Targets[$kind]
    New-Item -ItemType Directory -Force $out | Out-Null

    Get-ChildItem -Path $dir -Filter *.png | ForEach-Object {
        $slug = Get-Slug $_.BaseName
        $src = [System.Drawing.Bitmap]::FromFile($_.FullName)
        $box = Get-ContentBounds $src

        # Square canvas around the art, art centered.
        $side = [Math]::Max($box.Width, $box.Height)
        $side = [int][Math]::Ceiling($side * (1 + 2 * $Margin))
        $scale = $Size / $side
        $dw = $box.Width * $scale; $dh = $box.Height * $scale

        $dst = New-Object System.Drawing.Bitmap $Size, $Size, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
        $g = [System.Drawing.Graphics]::FromImage($dst)
        $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
        $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
        $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
        $g.Clear([System.Drawing.Color]::Transparent)
        $destRect = New-Object System.Drawing.RectangleF (($Size - $dw) / 2), (($Size - $dh) / 2), $dw, $dh
        $g.DrawImage($src, $destRect, [System.Drawing.RectangleF]$box, [System.Drawing.GraphicsUnit]::Pixel)
        $g.Dispose()

        $path = Join-Path $out "$slug.png"
        $dst.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
        "{0,-8} {1,-32} -> {2}.png  (art {3}x{4} of {5}x{6})" -f $kind, $_.Name, $slug, $box.Width, $box.Height, $src.Width, $src.Height
        $dst.Dispose(); $src.Dispose()
    }
}
