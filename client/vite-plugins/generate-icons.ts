import fs from 'node:fs/promises'
import path from 'node:path'
import type { Plugin } from 'vite'

const SOURCE = 'src/assets/favicon-source.webp'
const OUT_DIR = 'public/icons'

/** Resize from committed source; written before `public/` is copied to `dist/`. */
export function generateIconsPlugin(): Plugin {
  let root: string
  let command: 'build' | 'serve'

  return {
    name: 'generate-icons',

    configResolved(config) {
      root = config.root
      command = config.command
    },

    async buildStart() {
      if (process.env.VITEST) return

      const sourcePath = path.join(root, SOURCE)
      let hasSource = false
      try {
        await fs.access(sourcePath)
        hasSource = true
      } catch {
        console.warn(`[generate-icons] missing ${SOURCE}; skipping`)
        return
      }

      let sharp: Awaited<typeof import('sharp')>['default']
      try {
        sharp = (await import('sharp')).default
      } catch {
        if (command === 'build' && hasSource) {
          throw new Error('[generate-icons] Install sharp to build icons: npm i -D sharp')
        }
        console.warn('[generate-icons] sharp not installed; skipping icon generation')
        return
      }

      const outDir = path.join(root, OUT_DIR)
      await fs.mkdir(outDir, { recursive: true })

      const input = await fs.readFile(sourcePath)

      const resize = (size: number) =>
        sharp(input).resize(size, size, {
          fit: 'contain',
          background: { r: 0, g: 0, b: 0, alpha: 0 },
        })

      const w = (q: number) => ({ quality: q, effort: 6 } as const)

      await resize(32).webp(w(90)).toFile(path.join(outDir, 'favicon-32.webp'))
      await resize(48).webp(w(90)).toFile(path.join(outDir, 'favicon-48.webp'))
      await resize(192).webp(w(90)).toFile(path.join(outDir, 'pwa-192.webp'))
      await resize(512).webp(w(90)).toFile(path.join(outDir, 'pwa-512.webp'))
      await resize(180).png({ compressionLevel: 9 }).toFile(path.join(outDir, 'apple-touch-icon.png'))
    },
  }
}
