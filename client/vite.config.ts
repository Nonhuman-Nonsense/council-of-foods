/// <reference types="vitest" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import svgr from 'vite-plugin-svgr'
import path from 'path'

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
    server: {
      // mirrors your old CRA proxy setting
      proxy: {
        '/socket.io': 'http://localhost:3001',
        '/api': 'http://localhost:3001'
      },
    },
    test: {
      globals: true,
      environment: 'jsdom',
      setupFiles: './tests/unit/setupTests.js',
      include: [
        'tests/unit/**/*.{test,spec}.{js,jsx,ts,tsx}',
        'tests/forest/**/*.{test,spec}.{js,jsx,ts,tsx}',
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
        // Manual aliases are mostly removed as tsconfigPaths handles them.
        // Keeping @shared as it's outside src and might need explicit handling or just to be safe.
        // But if it's in tsconfig, tsconfigPaths should find it.
        // We will keep a fallback for explicit safety if tsconfig isn't perfect, 
        // but ideally we trust tsconfigPaths.
        // Let's rely on tsconfigPaths for standard aliases.
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
