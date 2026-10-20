#!/usr/bin/env node

/**
 * Generate the favicon, PWA icons and social share image from a source logo.
 *
 * The source image is expected to contain the brand emblem. The emblem is
 * cropped out, masked to a circle with transparent corners, and written out
 * at every size the app needs.
 *
 * Usage:
 *   node scripts/generate-icons.js <source-image> [output-dir]
 *
 * Example:
 *   node scripts/generate-icons.js ~/Downloads/ukwelitally-logo.jpeg
 */

const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')
const sharp = require('sharp')

const ROOT = path.join(__dirname, '..')

const source = process.argv[2]
const outDir = process.argv[3] || ROOT

if (!source || !fs.existsSync(source)) {
  console.error(
    'Usage: node scripts/generate-icons.js <source-image> [output-dir]\n' +
      '   The source image should contain the UkweliTally emblem.'
  )
  process.exit(1)
}

/** The app's dark background, used for maskable icons. */
const BRAND_BG = '#020617'

/** Sizes required by public/manifest.json. */
const PWA_SIZES = [72, 96, 128, 144, 152, 192, 384, 512]

/** Sizes embedded in favicon.ico. */
const ICO_SIZES = [16, 32, 48]

/**
 * Locate the emblem in the source image by finding the bounding box of the
 * saturated (non-grey) pixels.
 */
async function findEmblem(src) {
  const { data, info } = await sharp(src).removeAlpha().raw().toBuffer({ resolveWithObject: true })
  const { width, height, channels } = info

  let minX = width
  let maxX = 0
  let minY = height
  let maxY = 0

  // Only look at the top portion of the image: a logo file usually has the
  // mark above a wordmark.
  const scanHeight = Math.floor(height * 0.68)

  for (let y = 0; y < scanHeight; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * channels
      const r = data[i]
      const g = data[i + 1]
      const b = data[i + 2]
      const max = Math.max(r, g, b)
      const min = Math.min(r, g, b)
      const saturation = max === 0 ? 0 : (max - min) / max
      if (saturation > 0.25 && max > 40) {
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }

  if (maxX <= minX || maxY <= minY) {
    throw new Error('Could not locate the emblem in the source image')
  }

  const cx = (minX + maxX) / 2
  const cy = (minY + maxY) / 2
  const radius = Math.max(maxX - minX, maxY - minY) / 2

  // A small margin keeps the outer glow of the mark.
  const size = Math.ceil(radius * 2 + 12)
  const left = Math.round(cx - size / 2)
  const top = Math.round(cy - size / 2)

  return { left, top, size, radius, center: size / 2 }
}

/**
 * Crop the emblem and mask it to a circle with transparent corners.
 */
async function renderEmblem(src, emblem) {
  const mask = Buffer.from(
    `<svg width="${emblem.size}" height="${emblem.size}" xmlns="http://www.w3.org/2000/svg">
       <circle cx="${emblem.center}" cy="${emblem.center}" r="${emblem.radius}" fill="#fff"/>
     </svg>`
  )

  return sharp(src)
    .extract({ left: emblem.left, top: emblem.top, width: emblem.size, height: emblem.size })
    .composite([{ input: mask, blend: 'dest-in' }])
    .png()
    .toBuffer()
}

/**
 * Write a PNG at the given size.
 *
 * Palette (8-bit) PNG is used: the emblem is a flat-ish logo, so it quantises
 * to 256 colours with no visible loss and the files are roughly four times
 * smaller than 32-bit RGBA.
 */
async function writePng(buffer, size, filePath) {
  await sharp(buffer)
    .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png({
      compressionLevel: 9,
      palette: true,
      colours: 256,
      dither: 0.6,
      effort: 10,
    })
    .toFile(filePath)
}

/**
 * Write a maskable icon: the emblem sits inside the safe zone on a solid
 * background so Android does not clip it.
 */
async function writeMaskable(buffer, size, filePath) {
  // Maskable safe zone is a circle of 40% radius, so the logo is kept within
  // roughly 60% of the canvas.
  const inner = Math.round(size * 0.6)

  await sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: { r: 2, g: 6, b: 23, alpha: 1 },
    },
  })
    .composite([
      {
        input: await sharp(buffer).resize(inner, inner).png().toBuffer(),
        top: Math.round((size - inner) / 2),
        left: Math.round((size - inner) / 2),
      },
    ])
    .png({ compressionLevel: 9 })
    .toFile(filePath)
}

/**
 * Build a multi-resolution favicon.ico.
 *
 * The ICO container is written with Pillow, which resizes a single source
 * image into every requested resolution.
 */
async function writeIco(buffer, sizes, filePath) {
  const os = require('os')
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ico-'))

  try {
    // Pillow resizes from the largest source, so write that one out first.
    const largest = Math.max(...sizes)
    const sourcePng = path.join(tmpDir, 'source.png')
    await sharp(buffer)
      .resize(largest, largest, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png({ compressionLevel: 9, palette: true, colours: 256, dither: 0.6 })
      .toFile(sourcePng)

    const script = `
import sys
from PIL import Image
sizes = ${JSON.stringify(sizes)}
im = Image.open(sys.argv[2]).convert('RGBA')
im.save(sys.argv[1], format='ICO', sizes=[(s, s) for s in sizes])
`
    const scriptPath = path.join(tmpDir, 'make_ico.py')
    fs.writeFileSync(scriptPath, script)

    execFileSync('python3', [scriptPath, filePath, sourcePng], { stdio: 'inherit' })
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  }
}

async function main() {
  console.log(`\n🎨 Generating icons from: ${source}\n`)

  const emblem = await findEmblem(source)
  console.log(
    `   Emblem found at ${emblem.left},${emblem.top} (${emblem.size}px square, r=${Math.round(emblem.radius)})`
  )

  const buffer = await renderEmblem(source, emblem)

  const appDir = path.join(outDir, 'src', 'app')
  const publicIcons = path.join(outDir, 'public', 'icons')

  fs.mkdirSync(appDir, { recursive: true })
  fs.mkdirSync(publicIcons, { recursive: true })

  // Next.js App Router file conventions. Next.js emits the <link> tags.
  // 256px is plenty: the icon is rendered at 16-48px in a browser tab.
  await writePng(buffer, 256, path.join(appDir, 'icon.png'))
  console.log('   ✅ src/app/icon.png (256x256)')
  await writePng(buffer, 180, path.join(appDir, 'apple-icon.png'))
  console.log('   ✅ src/app/apple-icon.png (180x180)')

  // Legacy favicon, also served at /favicon.ico.
  await writeIco(buffer, ICO_SIZES, path.join(appDir, 'favicon.ico'))
  console.log(`   ✅ src/app/favicon.ico (${ICO_SIZES.join(', ')})`)

  // PWA icons referenced by public/manifest.json
  for (const size of PWA_SIZES) {
    await writePng(buffer, size, path.join(publicIcons, `icon-${size}x${size}.png`))
  }
  console.log(`   ✅ public/icons/icon-{${PWA_SIZES.join(',')}}.png`)

  // Maskable variants for Android
  for (const size of [192, 512]) {
    await writeMaskable(buffer, size, path.join(publicIcons, `icon-${size}x${size}-maskable.png`))
  }
  console.log('   ✅ public/icons/icon-{192,512}x*-maskable.png')

  // Social share image: emblem, wordmark and tagline on the brand background.
  const ogPath = path.join(appDir, 'opengraph-image.png')
  const emblemSize = 190
  const ogWidth = 1200
  const ogHeight = 630

  const ogText = Buffer.from(`<svg width="${ogWidth}" height="${ogHeight}" xmlns="http://www.w3.org/2000/svg">
      <text x="440" y="300" font-family="Lato Black, Lato, DejaVu Sans, sans-serif"
            font-size="78" font-weight="900" fill="#f1f5f9">ukwelitally</text>
      <text x="444" y="352" font-family="Lato, DejaVu Sans, sans-serif"
            font-size="30" font-weight="400" fill="#94a3b8">Independent Election Results Tallying</text>
      <text x="444" y="398" font-family="Lato, DejaVu Sans, sans-serif"
            font-size="26" font-weight="600" fill="#22c55e">Kenya 2027 Elections</text>
    </svg>`)

  await sharp({
    create: {
      width: ogWidth,
      height: ogHeight,
      channels: 4,
      background: { r: 2, g: 6, b: 23, alpha: 1 },
    },
  })
    .composite([
      // Subtle brand gradient, matching the app background.
      {
        input: Buffer.from(`<svg width="${ogWidth}" height="${ogHeight}" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <radialGradient id="g1" cx="0%" cy="0%" r="60%">
              <stop offset="0%" stop-color="#3b82f6" stop-opacity="0.18"/>
              <stop offset="100%" stop-color="#3b82f6" stop-opacity="0"/>
            </radialGradient>
            <radialGradient id="g2" cx="100%" cy="100%" r="60%">
              <stop offset="0%" stop-color="#a855f7" stop-opacity="0.16"/>
              <stop offset="100%" stop-color="#a855f7" stop-opacity="0"/>
            </radialGradient>
          </defs>
          <rect width="${ogWidth}" height="${ogHeight}" fill="url(#g1)"/>
          <rect width="${ogWidth}" height="${ogHeight}" fill="url(#g2)"/>
        </svg>`),
        top: 0,
        left: 0,
      },
      {
        input: await sharp(buffer).resize(emblemSize, emblemSize).png().toBuffer(),
        top: Math.round((ogHeight - emblemSize) / 2),
        left: 190,
      },
      { input: ogText, top: 0, left: 0 },
    ])
    .png({ compressionLevel: 9, palette: true, colours: 256, dither: 0.6 })
    .toFile(ogPath)
  console.log('   ✅ src/app/opengraph-image.png (1200x630)')

  console.log('\n✅ Done.\n')
}

main().catch((error) => {
  console.error('\n❌ Icon generation failed:', error.message)
  process.exit(1)
})
