#!/usr/bin/env node
/**
 * Generate PNG icons for InvoiceKasi PWA using sharp (converts SVG → PNG).
 * Run: node scripts/generate-icons.js   (from repo root)
 * Requires: npm install sharp (already in root devDependencies)
 *
 * Output: client/public/icons/icon-192.png, icon-512.png, icon-512-maskable.png
 */

const path = require('path')
const fs = require('fs')
const sharp = require('sharp')

const OUT_DIR = path.join(__dirname, '../client/public/icons')
fs.mkdirSync(OUT_DIR, { recursive: true })

async function main() {
  const icons = [
    {
      svg: path.join(OUT_DIR, 'icon-192.svg'),
      png: path.join(OUT_DIR, 'icon-192.png'),
    },
    {
      svg: path.join(OUT_DIR, 'icon-512.svg'),
      png: path.join(OUT_DIR, 'icon-512.png'),
    },
    {
      svg: path.join(OUT_DIR, 'icon-512-maskable.svg'),
      png: path.join(OUT_DIR, 'icon-512-maskable.png'),
    },
  ]

  for (const { svg, png } of icons) {
    if (!fs.existsSync(svg)) {
      console.error(`SVG not found: ${svg}`)
      continue
    }
    await sharp(svg).png().toFile(png)
    console.log(`✓ ${png}`)
  }

  console.log('\nAll icons generated.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})