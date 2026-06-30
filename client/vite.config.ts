/// <reference types="vitest" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import svgr from 'vite-plugin-svgr'
import path from 'path'
import dotenv from 'dotenv'
import { readServerPort, resolveDevPorts } from '../shared/devPorts'

dotenv.config({ path: path.resolve(__dirname, '../server/.env') })
const devPorts = resolveDevPorts(readServerPort(process.env))
const apiTarget = `http://localhost:${devPorts.server}`

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

export default defineConfig(async ({ command, mode }) => ({
    plugins: [
      react(),
      svgr(),
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
      setupFiles: './tests/unit/setupTests.js',
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
        '@shared': path.resolve(__dirname, '../shared'),
        'lottie-web': 'lottie-web/build/player/lottie_light',
      },
    },
    build: {
      chunkSizeWarningLimit: 1600,
      assetsInlineLimit: 10240,
      sourcemap: mode === 'analyze',
    },
}))
