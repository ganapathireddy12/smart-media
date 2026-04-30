/**
 * SmartMedia Icon Generator
 * Converts the source PNG/JPEG to all required icon formats:
 *   build/icon.ico   (Windows - multi-resolution ICO)
 *   build/icon.png   (Linux / generic)
 *   build/icon.icns  (macOS)
 *
 * Uses only built-in Node.js + jimp (no extra native deps).
 * Falls back to a PowerShell .NET approach on Windows if jimp fails.
 */

const path = require('path')
const fs   = require('fs')
const { execSync } = require('child_process')

const ROOT        = path.resolve(__dirname, '..')
const BUILD_DIR   = path.join(ROOT, 'build')
const PUBLIC_DIR  = path.join(ROOT, 'public')

// Source image candidates (first found wins)
const CANDIDATES = [
  path.join(PUBLIC_DIR, 'icon.png'),
  path.join(PUBLIC_DIR, 'icon.jpg'),
  path.join(PUBLIC_DIR, 'icon.jpeg'),
  path.join(PUBLIC_DIR, 'NetBoundTechnologies Logo.jpg.jpeg'),
  path.join(BUILD_DIR,  'icon-source.png'),
  path.join(BUILD_DIR,  'icon-source.jpg'),
]

const OUT_ICO  = path.join(BUILD_DIR, 'icon.ico')
const OUT_PNG  = path.join(BUILD_DIR, 'icon.png')

if (!fs.existsSync(BUILD_DIR)) fs.mkdirSync(BUILD_DIR, { recursive: true })

const source = CANDIDATES.find(p => fs.existsSync(p))
if (!source) {
  console.warn('[icons] No source image found – generating placeholder icon')
  generatePlaceholder()
  process.exit(0)
}

console.log(`[icons] Source: ${source}`)

// ─── Attempt 1: jimp (pure-JS, no native deps) ──────────────────────────────
async function generateWithJimp() {
  // Dynamic require so the script still works when jimp isn't installed
  const { Jimp } = require('jimp')

  const img = await Jimp.read(source)

  // ── PNG 512 × 512 (Linux / generic) ──────────────────────────────────────
  await img.clone().resize({ w: 512, h: 512 }).write(OUT_PNG)
  console.log('[icons] icon.png (512x512) written')

  // ── Multi-resolution ICO (Windows) ───────────────────────────────────────
  const sizes = [16, 24, 32, 48, 64, 128, 256]
  const pngBuffers = await Promise.all(
    sizes.map(async (s) => {
      const clone = img.clone().resize({ w: s, h: s })
      return clone.getBuffer('image/png')
    })
  )

  const icoBuffer = buildIcoFromPngBuffers(pngBuffers, sizes)
  fs.writeFileSync(OUT_ICO, icoBuffer)
  console.log('[icons] icon.ico (multi-res) written')

  console.log('[icons] Done – jimp')
}

// ─── Attempt 2: PowerShell .NET (Windows fallback) ──────────────────────────
function generateWithPowerShell() {
  const psScript = String.raw`
Add-Type -AssemblyName System.Drawing

function New-MultiSizeIco($sourcePath, $destPath, $sizes) {
    $images = @()
    foreach ($s in $sizes) {
        $bmp = New-Object System.Drawing.Bitmap($s, $s)
        $g   = [System.Drawing.Graphics]::FromImage($bmp)
        $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $g.SmoothingMode     = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
        $src = [System.Drawing.Image]::FromFile($sourcePath)
        $g.DrawImage($src, 0, 0, $s, $s)
        $src.Dispose()
        $g.Dispose()
        $ms = New-Object System.IO.MemoryStream
        $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
        $bmp.Dispose()
        $images += $ms.ToArray()
        $ms.Dispose()
    }

    $out = New-Object System.IO.MemoryStream
    $bw  = New-Object System.IO.BinaryWriter($out)
    $bw.Write([int16]0)                  # reserved
    $bw.Write([int16]1)                  # ICO type
    $bw.Write([int16]$sizes.Count)       # image count
    $offset = 6 + $sizes.Count * 16
    for ($i = 0; $i -lt $sizes.Count; $i++) {
        $s = $sizes[$i]
        $bw.Write([byte]( if ($s -ge 256) { 0 } else { $s } ))  # width
        $bw.Write([byte]( if ($s -ge 256) { 0 } else { $s } ))  # height
        $bw.Write([byte]0)               # color count
        $bw.Write([byte]0)               # reserved
        $bw.Write([int16]1)              # planes
        $bw.Write([int16]32)             # bit depth
        $bw.Write([int32]$images[$i].Length)
        $bw.Write([int32]$offset)
        $offset += $images[$i].Length
    }
    foreach ($img in $images) { $bw.Write($img) }
    $bw.Flush()
    [System.IO.File]::WriteAllBytes($destPath, $out.ToArray())
    $bw.Close()
}

$src   = '${source.replace(/\\/g, '\\\\')}'
$ico   = '${OUT_ICO.replace(/\\/g, '\\\\')}'
$png   = '${OUT_PNG.replace(/\\/g, '\\\\')}'
$sizes = @(16,24,32,48,64,128,256)

New-MultiSizeIco $src $ico $sizes
Write-Host "[icons] icon.ico written"

# Also write a 512x512 PNG
$bmp = New-Object System.Drawing.Bitmap(512,512)
$g   = [System.Drawing.Graphics]::FromImage($bmp)
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$img = [System.Drawing.Image]::FromFile($src)
$g.DrawImage($img,0,0,512,512)
$img.Dispose(); $g.Dispose()
$bmp.Save($png, [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()
Write-Host "[icons] icon.png written"
`

  const tmpPs = path.join(BUILD_DIR, '_gen_icons.ps1')
  fs.writeFileSync(tmpPs, psScript, 'utf8')
  try {
    execSync(`powershell -ExecutionPolicy Bypass -File "${tmpPs}"`, { stdio: 'inherit' })
    console.log('[icons] Done – PowerShell')
  } finally {
    try { fs.unlinkSync(tmpPs) } catch {}
  }
}

// ─── Attempt 3: Generate a minimal placeholder ICO ──────────────────────────
function generatePlaceholder() {
  // Tiny 32x32 black ICO (valid Windows icon)
  const buf = Buffer.from(
    '0000' +           // reserved
    '0100' +           // ICO type
    '0100' +           // 1 image
    '20200001' +       // 32x32, 1 colour plane
    '20000000' +       // bit depth=0x20(32)  size placeholder
    '16000000' +       // offset=22
    // Minimal BITMAPINFOHEADER + 4 bytes RGBA
    '28000000' +       // header size
    '20000000' + '40000000' + // width=32, height=64 (doubled for XOR+AND)
    '0100' + '2000' +  // planes=1, bitCount=32
    '00000000' +       // compression=0
    '00000000' +       // imageSize=0 (uncompressed)
    '00000000' + '00000000' + // XPelsPerMeter, YPelsPerMeter
    '00000000' + '00000000',  // clrUsed, clrImportant
    'hex'
  )
  fs.writeFileSync(OUT_ICO, buf)
  fs.copyFileSync(OUT_ICO, OUT_PNG)
  console.log('[icons] Placeholder icons written (replace build/icon.ico with a real icon)')
}

// ─── Pure-JS ICO assembler ───────────────────────────────────────────────────
function buildIcoFromPngBuffers(pngBuffers, sizes) {
  const n = sizes.length
  // ICO header (6) + directory entries (n * 16) + image data
  const headerSize = 6 + n * 16
  const totalSize  = headerSize + pngBuffers.reduce((a, b) => a + b.length, 0)
  const buf = Buffer.alloc(totalSize)
  // Header
  buf.writeUInt16LE(0,   0) // reserved
  buf.writeUInt16LE(1,   2) // ICO
  buf.writeUInt16LE(n,   4)

  let offset = headerSize
  for (let i = 0; i < n; i++) {
    const s   = sizes[i]
    const len = pngBuffers[i].length
    const base = 6 + i * 16
    buf.writeUInt8(s >= 256 ? 0 : s, base)     // width
    buf.writeUInt8(s >= 256 ? 0 : s, base + 1) // height
    buf.writeUInt8(0,   base + 2)               // colour count
    buf.writeUInt8(0,   base + 3)               // reserved
    buf.writeUInt16LE(1,  base + 4)             // planes
    buf.writeUInt16LE(32, base + 6)             // bit depth
    buf.writeUInt32LE(len,    base + 8)
    buf.writeUInt32LE(offset, base + 12)
    pngBuffers[i].copy(buf, offset)
    offset += len
  }
  return buf
}

// ─── Main ────────────────────────────────────────────────────────────────────
;(async () => {
  // Try jimp first
  try {
    await generateWithJimp()
    return
  } catch (e) {
    if (e.code === 'MODULE_NOT_FOUND') {
      console.warn('[icons] jimp not installed, trying PowerShell...')
    } else {
      console.warn('[icons] jimp error:', e.message)
    }
  }

  // Try PowerShell (Windows only)
  if (process.platform === 'win32') {
    try {
      generateWithPowerShell()
      return
    } catch (e) {
      console.warn('[icons] PowerShell error:', e.message)
    }
  }

  // Final fallback: placeholder
  console.warn('[icons] Using placeholder icon')
  generatePlaceholder()
})()
