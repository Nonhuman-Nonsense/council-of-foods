/**
 * Resize `src/assets/favicon-source.webp` into `public/icons/`.
 * Run when the source asset changes: `npm run generate-icons`
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const SOURCE = 'src/assets/favicon-source.webp'
const OUT_DIR = 'public/icons'

const clientRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

async function main() {
  const sourcePath = path.join(clientRoot, SOURCE)
  try {
    await fs.access(sourcePath)
  } catch {
    console.warn(`[generate-icons] missing ${SOURCE}; skipping`)
    return
  }

  let sharp
  try {
    sharp = (await import('sharp')).default
  } catch {
    throw new Error('[generate-icons] Install sharp: npm i sharp')
  }

  const input = await fs.readFile(sourcePath)
  const outDir = path.join(clientRoot, OUT_DIR)
  await fs.mkdir(outDir, { recursive: true })

  const resize = (size) =>
    sharp(input).resize(size, size, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })

  const w = (q) => ({ quality: q, effort: 6 })

  await resize(32).webp(w(90)).toFile(path.join(outDir, 'favicon-32.webp'))
  await resize(48).webp(w(90)).toFile(path.join(outDir, 'favicon-48.webp'))
  await resize(192).webp(w(90)).toFile(path.join(outDir, 'pwa-192.webp'))
  await resize(512).webp(w(90)).toFile(path.join(outDir, 'pwa-512.webp'))
  await resize(180).png({ compressionLevel: 9 }).toFile(path.join(outDir, 'apple-touch-icon.png'))
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
