import { defineConfig, mergeConfig } from 'vite'
import { visualizer } from 'rollup-plugin-visualizer'
import base from './vite.config'

export default defineConfig(async (env) => {
  const baseConfig =
    typeof base === 'function' ? await base(env) : await Promise.resolve(base)
  return mergeConfig(baseConfig, {
    plugins: [
      visualizer({
        open: true,
        filename: 'dist/stats.html',
      }),
    ],
  })
})
