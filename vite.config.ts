// @ts-nocheck
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  build: {
    lib: {
      entry: new URL('./src/index.ts', import.meta.url).pathname,
      name: 'ThreeMap',
      fileName: (format) => `three-map.${format}.js`
    },
    rollupOptions: {
      external: ['vue', 'three', 'd3-geo'],
      output: {
        globals: {
          vue: 'Vue'
        }
      }
    }
  }
})
