import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
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
    include: ['tests/unit/**/*.{test,spec}.{js,jsx}', 'tests/forest/**/*.{test,spec}.{js,jsx}'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})