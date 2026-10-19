# ============================================================
#  TowerForge Companion — Deploy Script
#  Builds frontend + backend and pushes to the VPS in one go.
#
#  Usage: .\deploy.ps1
# ============================================================

$ErrorActionPreference = "Stop"

try {

$VPS_HOST = "ubuntu@towerforge.net"
$REMOTE_CLIENT = "/var/www/towerforge/client"
$REMOTE_SERVER = "/var/www/towerforge/server"
$STAGING       = "/home/ubuntu/deploy-staging"

Write-Host "=== TowerForge Deploy ===" -ForegroundColor Cyan

# ── Step 1: Test + build frontend ───────────────────────────
Write-Host "`n[1/6] Testing and building frontend..." -ForegroundColor Yellow
Push-Location towerforge.client
npm test
if ($LASTEXITCODE -ne 0) {
    Write-Host "Tests failed - nothing was deployed." -ForegroundColor Red
    Pop-Location
    exit 1
}
npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Host "Frontend build failed!" -ForegroundColor Red
    Pop-Location
    exit 1
}
Pop-Location

# ── Step 2: Build backend ───────────────────────────────────
Write-Host "`n[2/6] Building backend..." -ForegroundColor Yellow
dotnet publish TowerForge.Server -c Release -r linux-x64 --self-contained true -o publish
if ($LASTEXITCODE -ne 0) {
    Write-Host "Backend build failed!" -ForegroundColor Red
    exit 1
}

# ── Step 2b: TowerForge Link (Windows helper) into the site's downloads ─
# After the backend: publishing the server rebuilds the client, which
# empties dist/.
Write-Host "`n[2b/6] Building TowerForge Link (downloads/TowerForgeLink.exe)..." -ForegroundColor Yellow
dotnet publish TowerForge.Link -c Release -o towerforge.client/dist/downloads
if ($LASTEXITCODE -ne 0) {
    Write-Host "TowerForge Link build failed!" -ForegroundColor Red
    exit 1
}

# ── Step 3: Prepare staging dirs on VPS ─────────────────────
Write-Host "`n[3/6] Preparing staging directories..." -ForegroundColor Yellow
ssh $VPS_HOST "rm -rf $STAGING && mkdir -p $STAGING/client $STAGING/server"

# ── Step 4: Upload to staging (ubuntu-owned, no perms issue) ─
Write-Host "`n[4/6] Uploading files to staging..." -ForegroundColor Yellow
scp -r towerforge.client/dist/* "${VPS_HOST}:${STAGING}/client/"
scp -r publish/* "${VPS_HOST}:${STAGING}/server/"

# ── Step 5: Stop backend before swapping files ──────────────
Write-Host "`n[5/6] Stopping backend service..." -ForegroundColor Yellow
ssh $VPS_HOST "sudo systemctl stop towerforge"

# ── Step 6: Move into place, fix perms, restart ─────────────
Write-Host "`n[6/6] Deploying and restarting services..." -ForegroundColor Yellow

$remoteCmd = "sudo rm -rf $REMOTE_CLIENT/* && " +
             "sudo cp -r $STAGING/client/* $REMOTE_CLIENT/ && " +
             "sudo chown -R www-data:www-data $REMOTE_CLIENT && " +
             "sudo chmod -R 755 $REMOTE_CLIENT && " +
             "sudo rm -rf $REMOTE_SERVER/* && " +
             "sudo cp -r $STAGING/server/* $REMOTE_SERVER/ && " +
             "sudo chown -R towerforge:towerforge $REMOTE_SERVER && " +
             "sudo chmod +x $REMOTE_SERVER/TowerForge.Server && " +
             "sudo systemctl start towerforge && " +
             "sudo systemctl reload nginx && " +
             "rm -rf $STAGING"

ssh $VPS_HOST $remoteCmd

Write-Host "`n=== Deploy complete! ===" -ForegroundColor Green
Write-Host "Live at https://towerforge.net" -ForegroundColor Green

} catch {
    Write-Host "`n=== DEPLOY FAILED ===" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
}

Write-Host "`nPress Enter to close..." -ForegroundColor Gray
Read-Host