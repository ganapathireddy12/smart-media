<#
.SYNOPSIS
    Bundle the SmartMedia Python AI engine with PyInstaller.
.DESCRIPTION
    Runs PyInstaller on python/main.py and places the output into
    build/python-engine/main/  so electron-builder can pick it up
    as an extraResource.
.EXAMPLE
    .\scripts\bundle-python.ps1
    .\scripts\bundle-python.ps1 -PythonCmd python3
#>

param(
    [string]$PythonCmd = "python"
)

$ErrorActionPreference = "Stop"
$ScriptDir  = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Split-Path -Parent $ScriptDir
Set-Location $ProjectRoot

function Write-Step { param($msg) Write-Host "`n>>> $msg" -ForegroundColor Cyan }
function Write-Ok   { param($msg) Write-Host "    OK  $msg" -ForegroundColor Green }
function Write-Fail { param($msg) Write-Host "    XX  $msg" -ForegroundColor Red }
function Write-Warn { param($msg) Write-Host "    !!  $msg" -ForegroundColor Yellow }

# ── Verify Python ──────────────────────────────────────────────────────────
Write-Step "Verifying Python..."
$pyVer = & $PythonCmd --version 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Fail "Python not found at '$PythonCmd'"
    exit 1
}
Write-Ok $pyVer

# ── Check / install PyInstaller ────────────────────────────────────────────
Write-Step "Checking PyInstaller..."
& $PythonCmd -m PyInstaller --version 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) {
    Write-Warn "Installing PyInstaller..."
    & $PythonCmd -m pip install pyinstaller --quiet
    if ($LASTEXITCODE -ne 0) { Write-Fail "Failed to install PyInstaller"; exit 1 }
}
Write-Ok "PyInstaller available"

# ── Install Python requirements ────────────────────────────────────────────
Write-Step "Verifying Python requirements..."
$reqFile = Join-Path $ProjectRoot "python\requirements.txt"
if (Test-Path $reqFile) {
    Write-Host "    Installing requirements (this can take a while)..."
    & $PythonCmd -m pip install -r $reqFile --quiet
    if ($LASTEXITCODE -ne 0) {
        Write-Warn "Some requirements failed to install - bundle may be incomplete"
    } else {
        Write-Ok "Requirements installed"
    }
}

# ── Run PyInstaller ────────────────────────────────────────────────────────
Write-Step "Running PyInstaller..."
$specFile  = Join-Path $ProjectRoot "python\smartmedia.spec"
$distPath  = Join-Path $ProjectRoot "build\python-engine"
$workPath  = Join-Path $ProjectRoot "build\pyinstaller-work"

if (-not (Test-Path $specFile)) {
    Write-Fail "smartmedia.spec not found at $specFile"
    exit 1
}

Push-Location (Join-Path $ProjectRoot "python")

& $PythonCmd -m PyInstaller `
    $specFile `
    --distpath $distPath `
    --workpath $workPath `
    --noconfirm `
    --clean

if ($LASTEXITCODE -ne 0) {
    Pop-Location
    Write-Fail "PyInstaller failed"
    exit 1
}
Pop-Location

$outDir = Join-Path $distPath "main"
if (Test-Path $outDir) {
    $exePath = Join-Path $outDir "main.exe"
    $sizeMB  = [math]::Round((Get-ChildItem $outDir -Recurse | Measure-Object -Property Length -Sum).Sum / 1MB, 0)
    Write-Ok "Bundled to: $outDir"
    Write-Ok "Total size: ~$sizeMB MB"
    if (Test-Path $exePath) {
        Write-Ok "Executable: main.exe"
    }
} else {
    Write-Warn "Output directory not found - check PyInstaller output above"
}

Write-Host "`nPython bundle complete!" -ForegroundColor Green
Write-Host "Add the following to package.json extraResources to include it in the installer:" -ForegroundColor Gray
Write-Host '  { "from": "build/python-engine/main", "to": "python-engine" }' -ForegroundColor White
