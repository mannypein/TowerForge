# ============================================================
#  TowerForge Companion — link preview image (public/og-image.png)
#  The 1200×630 card Discord, Reddit, X and search results show for a
#  towerforge.net link (index.html's og:image). Drawn, not screenshotted,
#  so it stays sharp: the default theme's colors (Synthwave), the tower
#  from components/common/TowerArt.tsx and the module frames from
#  ModuleBadge.tsx. Fonts: Bahnschrift and Segoe UI (Windows).
#  Run from towerforge.client/:
#    powershell -ExecutionPolicy Bypass -File scripts\og-image.ps1
# ============================================================

Add-Type -AssemblyName System.Drawing
$out = Join-Path $PSScriptRoot '..\public\og-image.png'

$W = 1200; $H = 630
$pink = [System.Drawing.ColorTranslator]::FromHtml('#ff4fa3')
$violet = [System.Drawing.ColorTranslator]::FromHtml('#7b6dff')
$bright = [System.Drawing.ColorTranslator]::FromHtml('#f8f3fe')
$dim = [System.Drawing.ColorTranslator]::FromHtml('#c3b8d8')
$line = [System.Drawing.ColorTranslator]::FromHtml('#2e2642')

$bmp = New-Object System.Drawing.Bitmap $W, $H
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = 'AntiAlias'
$g.InterpolationMode = 'HighQualityBicubic'
$g.TextRenderingHint = 'AntiAliasGridFit'

function Alpha($c, $a) { [System.Drawing.Color]::FromArgb($a, $c.R, $c.G, $c.B) }

# Soft light: an ellipse fading from `alpha` at its center to nothing.
function Glow($cx, $cy, $rx, $ry, $c, $a) {
    $p = New-Object System.Drawing.Drawing2D.GraphicsPath
    $p.AddEllipse([single]($cx - $rx), [single]($cy - $ry), [single](2 * $rx), [single](2 * $ry))
    $b = New-Object System.Drawing.Drawing2D.PathGradientBrush $p
    $b.CenterColor = Alpha $c $a
    $b.SurroundColors = @([System.Drawing.Color]::FromArgb(0, $c.R, $c.G, $c.B))
    $g.FillPath($b, $p)
}

# A path from point lists in a viewBox, scaled by $s and moved to ($ox, $oy).
function Shape($figures, $s, $ox, $oy) {
    $p = New-Object System.Drawing.Drawing2D.GraphicsPath
    foreach ($f in $figures) {
        $pts = for ($i = 0; $i -lt $f.pts.Count; $i += 2) { New-Object System.Drawing.PointF ([single]($ox + $f.pts[$i] * $s)), ([single]($oy + $f.pts[$i + 1] * $s)) }
        $p.StartFigure()
        $p.AddLines([System.Drawing.PointF[]]$pts)
        if ($f.closed) { $p.CloseFigure() }
    }
    $p
}

# Neon stroke: wide faint passes under the line.
function Neon($path, $c, $width) {
    foreach ($pass in @(@(4.5, 28), @(2.6, 60), @(1.6, 110))) {
        $pen = New-Object System.Drawing.Pen (Alpha $c $pass[1]), ([single]($width * $pass[0]))
        $pen.LineJoin = 'Round'; $pen.StartCap = 'Round'; $pen.EndCap = 'Round'
        $g.DrawPath($pen, $path)
    }
    $pen = New-Object System.Drawing.Pen $c, ([single]$width)
    $pen.LineJoin = 'Round'; $pen.StartCap = 'Round'; $pen.EndCap = 'Round'
    $g.DrawPath($pen, $path)
}

function RoundRect($x, $y, $w, $h, $r) {
    $p = New-Object System.Drawing.Drawing2D.GraphicsPath
    $d = 2 * $r
    $p.AddArc([single]$x, [single]$y, [single]$d, [single]$d, 180, 90)
    $p.AddArc([single]($x + $w - $d), [single]$y, [single]$d, [single]$d, 270, 90)
    $p.AddArc([single]($x + $w - $d), [single]($y + $h - $d), [single]$d, [single]$d, 0, 90)
    $p.AddArc([single]$x, [single]($y + $h - $d), [single]$d, [single]$d, 90, 90)
    $p.CloseFigure()
    $p
}

# ── Background ────────────────────────────────────────────────
$bg = New-Object System.Drawing.Drawing2D.LinearGradientBrush (New-Object System.Drawing.Point 0, 0), (New-Object System.Drawing.Point 0, $H), ([System.Drawing.ColorTranslator]::FromHtml('#0b0812')), ([System.Drawing.ColorTranslator]::FromHtml('#140f20'))
$g.FillRectangle($bg, 0, 0, $W, $H)
Glow 150 -60 560 330 $pink 70
Glow 1080 -40 600 340 $violet 85
Glow 600 700 700 220 $violet 35

# ── Title ─────────────────────────────────────────────────────
$titleFont = New-Object System.Drawing.FontFamily 'Bahnschrift SemiBold'
$fmt = [System.Drawing.StringFormat]::GenericTypographic
# Bahnschrift's outlines overlap, so the paths fill by winding (no holes).
$tower = New-Object System.Drawing.Drawing2D.GraphicsPath ([System.Drawing.Drawing2D.FillMode]::Winding)
$tower.AddString('TOWER', $titleFont, 0, 90, (New-Object System.Drawing.PointF 66, 124), $fmt)
$tb = $tower.GetBounds()
$forge = New-Object System.Drawing.Drawing2D.GraphicsPath ([System.Drawing.Drawing2D.FillMode]::Winding)
$forge.AddString('FORGE', $titleFont, 0, 90, (New-Object System.Drawing.PointF ([single]($tb.Right + 6)), 124), $fmt)
$fb = $forge.GetBounds()
foreach ($pass in @(@(16, 22), @(8, 45))) {
    $tp = New-Object System.Drawing.Pen (Alpha $pink $pass[1]), $pass[0]; $tp.LineJoin = 'Round'
    $fp = New-Object System.Drawing.Pen (Alpha $violet $pass[1]), $pass[0]; $fp.LineJoin = 'Round'
    $g.DrawPath($tp, $tower)
    $g.DrawPath($fp, $forge)
}
$g.FillPath((New-Object System.Drawing.SolidBrush $bright), $tower)
$fg = New-Object System.Drawing.Drawing2D.LinearGradientBrush (New-Object System.Drawing.PointF $fb.Left, 0), (New-Object System.Drawing.PointF $fb.Right, 0), $pink, $violet
$g.FillPath($fg, $forge)

# Lit line under the title.
$ly = [single]($tb.Bottom + 26)
$lineBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush (New-Object System.Drawing.PointF 70, 0), (New-Object System.Drawing.PointF ([single]$fb.Right), 0), $pink, $violet
foreach ($pass in @(@(14, 30), @(7, 60))) {
    $lb = New-Object System.Drawing.Drawing2D.LinearGradientBrush (New-Object System.Drawing.PointF 70, 0), (New-Object System.Drawing.PointF ([single]$fb.Right), 0), (Alpha $pink $pass[1]), (Alpha $violet $pass[1])
    $g.FillRectangle($lb, 70, [single]($ly - $pass[0] / 2 + 1.5), [single]($fb.Right - 70), [single]$pass[0])
}
$g.FillRectangle($lineBrush, 70, $ly, [single]($fb.Right - 70), 3)

# ── Words ─────────────────────────────────────────────────────
$g.DrawString('Companion for The Tower', (New-Object System.Drawing.Font 'Segoe UI Semibold', 34, ([System.Drawing.FontStyle]::Regular), ([System.Drawing.GraphicsUnit]::Pixel)), (New-Object System.Drawing.SolidBrush $bright), 66, [single]($ly + 30))
$g.DrawString('Import your account and see what to upgrade next, ranked by the waves and coins each upgrade gives for what it costs.',
    (New-Object System.Drawing.Font 'Segoe UI', 24, ([System.Drawing.FontStyle]::Regular), ([System.Drawing.GraphicsUnit]::Pixel)), (New-Object System.Drawing.SolidBrush $dim),
    (New-Object System.Drawing.RectangleF 68, ([single]($ly + 86)), 560, 100))

# Pills: the main pages.
$pillFont = New-Object System.Drawing.Font 'Bahnschrift SemiBold', 19, ([System.Drawing.FontStyle]::Regular), ([System.Drawing.GraphicsUnit]::Pixel)
$px = 68; $py = 470
foreach ($label in @('Optimizer', 'What If', 'Tournaments', 'Modules & Bots')) {
    $size = $g.MeasureString($label, $pillFont)
    $pw = [int]$size.Width + 24
    $pill = RoundRect $px $py $pw 40 20
    $g.FillPath((New-Object System.Drawing.SolidBrush (Alpha $pink 26)), $pill)
    $g.DrawPath((New-Object System.Drawing.Pen (Alpha $pink 170), 1.5), $pill)
    $g.DrawString($label, $pillFont, (New-Object System.Drawing.SolidBrush $bright), [single]($px + 12), [single]($py + 9))
    $px += $pw + 10
}

$g.DrawString('towerforge.net', (New-Object System.Drawing.Font 'Bahnschrift SemiBold', 28, ([System.Drawing.FontStyle]::Regular), ([System.Drawing.GraphicsUnit]::Pixel)), (New-Object System.Drawing.SolidBrush $pink), 66, 548)

# ── The module board ──────────────────────────────────────────
$panel = RoundRect 676 86 476 460 18
$g.FillPath((New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(200, 19, 15, 28))), $panel)
$g.SetClip($panel)
Glow 914 316 260 230 $violet 70
$g.ResetClip()
$g.DrawPath((New-Object System.Drawing.Pen $line, 2), $panel)
$g.DrawPath((New-Object System.Drawing.Pen (Alpha $violet 90), 1), $panel)

# Tower (TowerArt viewBox 120 × 190).
$s = 1.75; $ox = 914 - 60 * $s; $oy = 316 - 95 * $s
$towerPink = Shape @(
    @{ pts = @(38, 22, 82, 22, 88, 34, 88, 62, 32, 62, 32, 34); closed = $true },
    @{ pts = @(12, 34, 32, 34, 32, 48, 12, 48); closed = $true },
    @{ pts = @(44, 62, 76, 62, 78, 76, 42, 76); closed = $true },
    @{ pts = @(42, 76, 78, 76, 96, 150, 24, 150); closed = $true }
) $s $ox $oy
$towerViolet = Shape @(
    @{ pts = @(48, 32, 72, 32, 72, 52, 48, 52); closed = $true },
    @{ pts = @(54, 88, 66, 88, 72, 140, 48, 140); closed = $true },
    @{ pts = @(24, 150, 32, 178, 48, 178, 52, 150); closed = $false },
    @{ pts = @(68, 150, 72, 178, 88, 178, 96, 150); closed = $false }
) $s $ox $oy
Neon $towerPink $pink 5
Neon $towerViolet $violet 5

# Module frames (ModuleBadge viewBox 100), in rarity colors.
$octagon = @(33, 7, 67, 7, 93, 33, 93, 67, 67, 93, 33, 93, 7, 67, 7, 33)
$triangle = @(50, 6, 95, 88, 5, 88)
$diamond = @(50, 4, 96, 50, 50, 96, 4, 50)
$bs = 0.92
$badges = @(
    @{ kind = 'circle'; cx = 752; cy = 222; color = '#00e676' },
    @{ kind = 'octagon'; cx = 752; cy = 410; color = '#f44336' },
    @{ kind = 'triangle'; cx = 1076; cy = 222; color = '#ff9800' },
    @{ kind = 'diamond'; cx = 1076; cy = 410; color = '#e040fb' }
)
foreach ($b in $badges) {
    $c = [System.Drawing.ColorTranslator]::FromHtml($b.color)
    $bx = $b.cx - 50 * $bs; $by = $b.cy - 50 * $bs
    if ($b.kind -eq 'circle') {
        $p = New-Object System.Drawing.Drawing2D.GraphicsPath
        $p.AddEllipse([single]($bx + 6 * $bs), [single]($by + 6 * $bs), [single](88 * $bs), [single](88 * $bs))
    } else {
        $pts = @{ octagon = $octagon; triangle = $triangle; diamond = $diamond }[$b.kind]
        $p = Shape @(@{ pts = $pts; closed = $true }) $bs $bx $by
    }
    $g.FillPath((New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(215, 8, 10, 14))), $p)
    Neon $p $c 5
}

$bmp.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose(); $bmp.Dispose()
Write-Output (Resolve-Path $out).Path
