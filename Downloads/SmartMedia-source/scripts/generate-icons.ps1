<#
.SYNOPSIS
    Generate application icons for SmartMedia using Windows .NET.
    For a proper NSIS-compatible Icon, uses a simpler approach.
#>

param(
    [string]$SourceImage = "",
    [string]$OutputDir   = ""
)

$ErrorActionPreference = "Stop"
$ScriptDir   = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Split-Path -Parent $ScriptDir

if (-not $OutputDir) { $OutputDir = Join-Path $ProjectRoot "build" }
if (-not (Test-Path $OutputDir)) { New-Item -ItemType Directory -Path $OutputDir | Out-Null }

# ── Locate source image ────────────────────────────────────────────────────
if (-not $SourceImage) {
    $candidates = @(
        (Join-Path $ProjectRoot "public\icon.png"),
        (Join-Path $ProjectRoot "public\icon.jpg"),
        (Join-Path $ProjectRoot "public\icon.jpeg"),
        (Join-Path $ProjectRoot "public\NetBoundTechnologies Logo.jpg.jpeg"),
        (Join-Path $OutputDir "icon-source.png"),
        (Join-Path $OutputDir "icon-source.jpg")
    )
    foreach ($c in $candidates) {
        if (Test-Path $c) { $SourceImage = $c; break }
    }
}

if (-not $SourceImage -or -not (Test-Path $SourceImage)) {
    Write-Warning "[icons] No source image found. Creating basic fallback icons."
    # Create basic white fallback icon
    Add-Type -AssemblyName System.Drawing
    $bmp = New-Object System.Drawing.Bitmap(256, 256)
    $g   = [System.Drawing.Graphics]::FromImage($bmp)
    $g.Clear([System.Drawing.Color]::White)
    $g.DrawString("SM", [System.Drawing.SystemFonts]::DefaultFont, [System.Drawing.Brushes]::Black, 10, 10)
    $g.Dispose()
    $bmp.Save((Join-Path $OutputDir "icon.ico"), [System.Drawing.Imaging.ImageFormat]::Jpeg)
    $bmp.Save((Join-Path $OutputDir "icon.png"), [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
    Write-Host "[icons] Fallback icons created"
    exit 0
}

Write-Host "[icons] Source : $SourceImage" -ForegroundColor Cyan
Write-Host "[icons] Output : $OutputDir"  -ForegroundColor Cyan

Add-Type -AssemblyName System.Drawing

# ── Simple approach: Just resize to common icon size ─────────────────────────
$src = [System.Drawing.Image]::FromFile($SourceImage)

# 256x256 for icon.ico 
$size256 = New-Object System.Drawing.Bitmap(256, 256)
$g = [System.Drawing.Graphics]::FromImage($size256)
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.DrawImage($src, 0, 0, 256, 256)
$g.Dispose()

# Save as ICO (Windows will handle the format)
$icoPath = Join-Path $OutputDir "icon.ico"
$size256.Save($icoPath, [System.Drawing.Imaging.ImageFormat]::Icon)
$size256.Dispose()
Write-Host "[icons] icon.ico written (256×256)" -ForegroundColor Green

# 512x512 for PNG
$size512 = New-Object System.Drawing.Bitmap(512, 512)
$g = [System.Drawing.Graphics]::FromImage($size512)
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.DrawImage($src, 0, 0, 512, 512)
$g.Dispose()

$pngPath = Join-Path $OutputDir "icon.png"
$size512.Save($pngPath, [System.Drawing.Imaging.ImageFormat]::Png)
$size512.Dispose()
Write-Host "[icons] icon.png written (512×512)" -ForegroundColor Green

$src.Dispose()
Write-Host "[icons] Done" -ForegroundColor Cyan
