/// <reference types="vitest" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import checker from 'vite-plugin-checker'
import tsconfigPaths from 'vite-tsconfig-paths'
import path from 'path'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tsconfigPaths(), // Read paths directly from tsconfig.json
    checker({
      typescript: {
        tsconfigPath: 'tsconfig.build.json',
      },
    })
  ],
  server: {
    // mirrors your old CRA proxy setting
    proxy: {
      '/socket.io': 'http://localhost:3001',
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './tests/unit/setupTests.js',
    include: ['tests/unit/**/*.{test,spec}.{js,jsx,ts,tsx}'],
  },
  resolve: {
    alias: {
      // Manual aliases are mostly removed as tsconfigPaths handles them.
      // Keeping @shared as it's outside src and might need explicit handling or just to be safe.
      // But if it's in tsconfig, tsconfigPaths should find it.
      // We will keep a fallback for explicit safety if tsconfig isn't perfect, 
      // but ideally we trust tsconfigPaths.
      // Let's rely on tsconfigPaths for standard aliases.
      '@shared': path.resolve(__dirname, '../shared'),
    },
  },
})