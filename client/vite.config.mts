/// <reference types="vitest" />
import { defineConfig, loadEnv, type Connect, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import svgr from 'vite-plugin-svgr'
import path from 'path'
import { readServerPort, resolveDevPorts } from '../shared/devPorts.ts'
import { METER_PAGE_PATHS } from '../shared/MeterTypes.ts'

/**
 * Serves the footprint meter's own page (meter.html) at its production URLs, /meter and
 * /meter/methodology, so dev and preview use the same links as the deployed server.
 */
function meterPages(): Plugin {
  const rewrite: Connect.NextHandleFunction = (req, _res, next) => {
    const [pathname, query] = (req.url ?? '').split('?')
    if (METER_PAGE_PATHS.includes(pathname.replace(/\/$/, ''))) {
      req.url = `/meter.html${query ? `?${query}` : ''}`
    }
    next()
  }
  return {
    name: 'meter-pages',
    configureServer: (server) => { server.middlewares.use(rewrite) },
    configurePreviewServer: (server) => { server.middlewares.use(rewrite) },
  }
}

/** Checker is dev-only (vite-plugin-checker is a devDependency); production/docker runs `tsc` before `vite build`. */
async function devPlugins(command: string) {
  if (command !== 'serve') return []
  const checker = (await import(/* @vite-ignore */ 'vite-plugin-checker')).default
  return [
    checker({
      typescript: {
        tsconfigPath: 'tsconfig.build.json',
      },
    }),
  ]
}

export default defineConfig(async ({ command, mode }) => {
  let devPorts = resolveDevPorts()
  if (command === 'serve') {
    const serverEnv = loadEnv(mode, path.resolve(import.meta.dirname, '../server'), '')
    devPorts = resolveDevPorts(readServerPort(serverEnv))
  }
  const apiTarget = `http://localhost:${devPorts.server}`

  return {
    plugins: [
      react(),
      svgr(),
      meterPages(),
      ...(await devPlugins(command)),
    ],
    server: command === 'serve' ? {
      port: devPorts.clientDev,
      strictPort: true,
      proxy: {
        '/socket.io': apiTarget,
        '/api': apiTarget,
      },
    } : undefined,
    test: {
      globals: true,
      environment: 'jsdom',
      setupFiles: './tests/unit/setupTests.ts',
      include: [
        'tests/unit/**/*.{test,spec}.{js,jsx,ts,tsx}',
        'tests/foods/**/*.{test,spec}.{js,jsx,ts,tsx}',
      ],
      coverage: {
        provider: 'v8',
        reporter: ['text', 'json', 'html'],
      },
    },
    resolve: {
      tsconfigPaths: true,
      alias: {
        '@shared': path.resolve(import.meta.dirname, '../shared'),
        'lottie-web': 'lottie-web/build/player/lottie_light',
      },
    },
    build: {
      rollupOptions: {
        // The footprint meter is its own page and bundle (docs/ai-footprint-meter.md).
        input: {
          main: path.resolve(import.meta.dirname, 'index.html'),
          meter: path.resolve(import.meta.dirname, 'meter.html'),
        },
      },
      chunkSizeWarningLimit: 1600,
      assetsInlineLimit: 10240,
      sourcemap: mode === 'analyze',
    },
  }
})
