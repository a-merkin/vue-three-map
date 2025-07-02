// @ts-nocheck
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import dts from 'vite-plugin-dts'

export default defineConfig({
  plugins: [vue(), dts({
    rollupTypes: true,
    tsconfigPath: './tsconfig.app.json'
  })],
  build: {
    lib: {
      entry: './src/index.ts',
      name: 'ThreeMap',
      fileName: (format) => `three-map.${format}.js`
    },
    rollupOptions: {
      external: ['vue', 'three', 'd3-geo'],
      output: {
        exports: 'named',
        globals: {
          vue: 'Vue',
          three: 'THREE',
          'd3-geo': 'd3Geo'
        }
      }
    }
  }
})
