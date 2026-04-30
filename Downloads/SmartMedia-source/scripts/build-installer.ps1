<#
.SYNOPSIS
    SmartMedia Complete Installer Build Pipeline
.DESCRIPTION
    Builds the SmartMedia Windows installer (.exe) step by step:
    1. Checks prerequisites (Node, Python, npm packages)
    2. Generates application icons from source image
    3. Rebuilds native modules (better-sqlite3) for Electron
    4. Builds the frontend (Vite + React)
    5. Compiles Electron main/preload (TypeScript)
    6. Bundles Python AI engine (optional - if PyInstaller available)
    7. Packages everything into a NSIS installer via electron-builder
.EXAMPLE
    .\scripts\build-installer.ps1
    .\scripts\build-installer.ps1 -SkipPython -SkipIconGen
    .\scripts\build-installer.ps1 -Target portable
#>

param(
    [switch]$SkipPython,        # Skip PyInstaller step
    [switch]$SkipIconGen,       # Skip icon generation (use existing icons)
    [switch]$SkipRebuild,       # Skip electron-rebuild
    [string]$Target = "nsis",   # nsis | portable | dir (dir = unpackaged)
    [switch]$CleanBuild         # Delete dist/ and release/ before building
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

# ─── Colours ────────────────────────────────────────────────────────────────
function Write-Step  { param($msg) Write-Host "`n>>> $msg" -ForegroundColor Cyan }
function Write-Ok    { param($msg) Write-Host "    OK  $msg" -ForegroundColor Green }
function Write-Warn  { param($msg) Write-Host "    !!  $msg" -ForegroundColor Yellow }
function Write-Fail  { param($msg) Write-Host "    XX  $msg" -ForegroundColor Red }

# ─── Root detection ─────────────────────────────────────────────────────────
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Split-Path -Parent $ScriptDir
Set-Location $ProjectRoot
Write-Host "`nSmartMedia Installer Builder" -ForegroundColor Magenta
Write-Host "Project: $ProjectRoot" -ForegroundColor Gray

# ─── STEP 0: Pre-flight checks ──────────────────────────────────────────────
Write-Step "Checking prerequisites..."

# Node.js
try {
    $nodeVer = & node --version 2>&1
    Write-Ok "Node.js $nodeVer"
} catch {
    Write-Fail "Node.js not found. Install from https://nodejs.org"
    exit 1
}

# npm
try {
    $npmVer = & npm --version 2>&1
    Write-Ok "npm $npmVer"
} catch {
    Write-Fail "npm not found."
    exit 1
}

# electron-builder
$ebPath = Join-Path $ProjectRoot "node_modules\.bin\electron-builder.cmd"
if (-not (Test-Path $ebPath)) {
    Write-Warn "electron-builder not found, running npm install..."
    & npm install --legacy-peer-deps
    if ($LASTEXITCODE -ne 0) { Write-Fail "npm install failed"; exit 1 }
}
Write-Ok "electron-builder available"

# Python (optional - for AI bundling)
$pythonCmd = $null
foreach ($py in @("python", "python3", "py")) {
    try {
        $pyVer = & $py --version 2>&1
        if ($pyVer -match "Python 3") {
            $pythonCmd = $py
            Write-Ok "Python: $pyVer (using '$py')"
            break
        }
    } catch { }
}
if (-not $pythonCmd) {
    Write-Warn "Python not found - AI bundling will be skipped"
    $SkipPython = $true
}

# ─── STEP 1: Clean (optional) ───────────────────────────────────────────────
if ($CleanBuild) {
    Write-Step "Cleaning previous builds..."
    foreach ($dir in @("dist", "dist-electron", "release")) {
        $path = Join-Path $ProjectRoot $dir
        if (Test-Path $path) {
            Remove-Item $path -Recurse -Force
            Write-Ok "Removed $dir/"
        }
    }
}

# ─── STEP 2: Generate icons ──────────────────────────────────────────────────
Write-Step "Generating application icons..."

$iconIco  = Join-Path $ProjectRoot "build\icon.ico"
$iconPng  = Join-Path $ProjectRoot "build\icon.png"
$iconIcns = Join-Path $ProjectRoot "build\icon.icns"

if ($SkipIconGen -and (Test-Path $iconIco)) {
    Write-Ok "Skipping icon generation (existing icons found)"
} else {
    # Run the Node.js icon generator
    $genScript = Join-Path $ProjectRoot "scripts\generate-icons.js"
    if (Test-Path $genScript) {
        Write-Host "    Running icon generator..."
        & node $genScript
        if ($LASTEXITCODE -eq 0) {
            Write-Ok "Icons generated successfully"
        } else {
            Write-Warn "Icon generation had warnings (build will continue)"
        }
    } else {
        Write-Warn "Icon generator not found, using PowerShell fallback..."
        & "$ScriptDir\generate-icons.ps1"
    }

    # Final check
    if (Test-Path $iconIco) {
        Write-Ok "icon.ico ready"
    } else {
        Write-Warn "icon.ico not found - installer will use default Electron icon"
    }
}

# ─── STEP 3: Install / update npm dependencies ───────────────────────────────
Write-Step "Installing npm dependencies..."
& npm install --legacy-peer-deps
if ($LASTEXITCODE -ne 0) { Write-Fail "npm install failed"; exit 1 }
Write-Ok "Dependencies installed"

# ─── STEP 4: Rebuild native modules for Electron ────────────────────────────
if (-not $SkipRebuild) {
    Write-Step "Rebuilding native modules for Electron (better-sqlite3)..."
    $rebuildBin = Join-Path $ProjectRoot "node_modules\.bin\electron-rebuild.cmd"
    if (Test-Path $rebuildBin) {
        & $rebuildBin -f -w better-sqlite3
        if ($LASTEXITCODE -ne 0) {
            Write-Warn "electron-rebuild returned non-zero, but continuing..."
        } else {
            Write-Ok "Native modules rebuilt"
        }
    } else {
        Write-Warn "electron-rebuild not found, running via npx..."
        & npx electron-rebuild -f -w better-sqlite3
    }
}

# ─── STEP 5: Compile TypeScript (Electron main + preload) ────────────────────
Write-Step "Compiling Electron TypeScript sources..."
& npx tsc -p tsconfig.electron.json
if ($LASTEXITCODE -ne 0) { Write-Fail "TypeScript compilation failed"; exit 1 }
Write-Ok "TypeScript compiled to dist-electron/"

# ─── STEP 6: Build frontend (Vite) ───────────────────────────────────────────
Write-Step "Building React frontend (Vite)..."
& npx vite build
if ($LASTEXITCODE -ne 0) { Write-Fail "Vite build failed"; exit 1 }
Write-Ok "Frontend built to dist/"

# ─── STEP 7: Bundle Python AI engine (PyInstaller) ───────────────────────────
if (-not $SkipPython -and $pythonCmd) {
    Write-Step "Bundling Python AI engine with PyInstaller..."

    # Check PyInstaller is available
    $piAvailable = $false
    try {
        & $pythonCmd -m PyInstaller --version 2>&1 | Out-Null
        $piAvailable = $LASTEXITCODE -eq 0
    } catch { }

    if (-not $piAvailable) {
        Write-Warn "PyInstaller not installed. Installing..."
        & $pythonCmd -m pip install pyinstaller --quiet
        $piAvailable = ($LASTEXITCODE -eq 0)
    }

    if ($piAvailable) {
        $specFile = Join-Path $ProjectRoot "python\smartmedia.spec"
        if (Test-Path $specFile) {
            Push-Location (Join-Path $ProjectRoot "python")
            & $pythonCmd -m PyInstaller $specFile --distpath (Join-Path $ProjectRoot "build\python-engine") --noconfirm
            if ($LASTEXITCODE -eq 0) {
                Write-Ok "Python engine bundled to build/python-engine/"
            } else {
                Write-Warn "PyInstaller failed - app will fall back to system Python"
            }
            Pop-Location
        } else {
            Write-Warn "smartmedia.spec not found - skipping PyInstaller"
        }
    } else {
        Write-Warn "PyInstaller not available - app will use system Python"
    }
} else {
    Write-Warn "Python bundling skipped - app will use system Python at runtime"
}

# ─── STEP 8: Package with electron-builder ───────────────────────────────────
Write-Step "Packaging with electron-builder (target: $Target)..."

$ebArgs = @("--win")
switch ($Target) {
    "nsis"     { $ebArgs += "--x64" }
    "portable" { $ebArgs += "--x64"; $ebArgs += "--config.win.target=portable" }
    "dir"      { $ebArgs += "--dir" }
    default    { $ebArgs += "--x64" }
}
$ebArgs += "--publish"
$ebArgs += "never"

Write-Host "    electron-builder $($ebArgs -join ' ')"
& npx electron-builder @ebArgs
if ($LASTEXITCODE -ne 0) { Write-Fail "electron-builder failed (exit $LASTEXITCODE)"; exit 1 }

# ─── Done ────────────────────────────────────────────────────────────────────
Write-Step "Build complete!"

$releaseDir = Join-Path $ProjectRoot "release"
if (Test-Path $releaseDir) {
    $installers = Get-ChildItem $releaseDir -Filter "*.exe" -Recurse |
        Where-Object { $_.Name -notlike "*unpacked*" }
    if ($installers) {
        Write-Host "`nInstaller files:" -ForegroundColor Green
        foreach ($f in $installers) {
            $sizeMB = [math]::Round($f.Length / 1MB, 1)
            Write-Host "   $($f.Name)  ($sizeMB MB)" -ForegroundColor White
            Write-Host "   $($f.FullName)" -ForegroundColor Gray
        }
    }
}

Write-Host "`nDone! Output folder: $releaseDir`n" -ForegroundColor Magenta
