# ============================================================
#  TowerForge Link for Android — build
#  Builds the APK with the Gradle wrapper. Java 17 and the Android SDK
#  come from JAVA_HOME / ANDROID_HOME, else the portable copies in
#  %LOCALAPPDATA%\TowerForgeBuild\ (jdk17, android-sdk) set up on
#  2026-10-23 (docs/towerforge-link.md, "Building the Android app").
#
#    .\build.ps1                      release APK (signed when the key is set up)
#    .\build.ps1 -Debug               debug APK, for testing
#    .\build.ps1 -Out <file.apk>      also copy the APK there
#    .\build.ps1 -NewKey              create the release signing key (once)
#
#  The signing key never goes in the repo: %USERPROFILE%\.towerforge\
#  link-android.jks and link-android-signing.properties. Back both up —
#  Android only installs updates signed with the same key.
# ============================================================

param(
    [switch]$Debug,
    [string]$Out,
    [switch]$NewKey
)

$ErrorActionPreference = 'Stop'
$here = $PSScriptRoot
$tools = Join-Path $env:LOCALAPPDATA 'TowerForgeBuild'

if (-not $env:JAVA_HOME -or -not (Test-Path (Join-Path $env:JAVA_HOME 'bin\java.exe'))) {
    $env:JAVA_HOME = Join-Path $tools 'jdk17'
}
if (-not (Test-Path (Join-Path $env:JAVA_HOME 'bin\java.exe'))) { throw "Java 17 not found (JAVA_HOME or $tools\jdk17)." }
if (-not $env:ANDROID_HOME -or -not (Test-Path $env:ANDROID_HOME)) { $env:ANDROID_HOME = Join-Path $tools 'android-sdk' }
if (-not (Test-Path (Join-Path $env:ANDROID_HOME 'platforms\android-35'))) { throw "Android SDK 35 not found (ANDROID_HOME or $tools\android-sdk)." }

# Gradle reads the SDK folder from local.properties (not committed).
$sdk = $env:ANDROID_HOME -replace '\\', '\\' -replace ':', '\:'
Set-Content -Path (Join-Path $here 'local.properties') -Value "sdk.dir=$sdk" -Encoding ascii

$keyDir = Join-Path $env:USERPROFILE '.towerforge'
$props = Join-Path $keyDir 'link-android-signing.properties'
if ($NewKey) {
    if (Test-Path $props) { throw "A signing key already exists ($props). Keep using it." }
    New-Item -ItemType Directory -Force $keyDir | Out-Null
    $bytes = New-Object byte[] 24
    [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
    $pass = [Convert]::ToBase64String($bytes) -replace '[+/=]', ''
    & (Join-Path $env:JAVA_HOME 'bin\keytool.exe') -genkeypair -v -keystore (Join-Path $keyDir 'link-android.jks') `
        -alias towerforge-link -keyalg RSA -keysize 3072 -validity 18250 -storepass $pass -keypass $pass `
        -dname 'CN=TowerForge Link, O=TowerForge, C=US' | Out-Null
    Set-Content -Path $props -Encoding ascii -Value @(
        'storeFile=link-android.jks', "storePassword=$pass", 'keyAlias=towerforge-link', "keyPassword=$pass")
    Write-Host "Created the signing key in $keyDir. Back up that folder."
    return
}

$task = if ($Debug) { 'assembleDebug' } else { 'assembleRelease' }
Push-Location $here
try {
    & .\gradlew.bat $task --no-daemon -q
    if ($LASTEXITCODE -ne 0) { throw "Gradle failed ($LASTEXITCODE)." }
} finally {
    Pop-Location
}

$kind = if ($Debug) { 'debug' } else { 'release' }
$apk = Get-ChildItem (Join-Path $here "app\build\outputs\apk\$kind") -Filter '*.apk' | Sort-Object LastWriteTime -Descending | Select-Object -First 1
if (-not $apk) { throw 'No APK was built.' }
if (-not $Debug -and $apk.Name -like '*unsigned*') { Write-Warning 'The release APK is unsigned: run .\build.ps1 -NewKey once.' }
if ($Out) {
    New-Item -ItemType Directory -Force (Split-Path $Out) | Out-Null
    Copy-Item $apk.FullName $Out -Force
    Write-Host "Copied $($apk.Name) to $Out"
}
$apk.FullName
