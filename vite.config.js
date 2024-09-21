import { defineConfig } from 'vite'

export default defineConfig({
  root: '.',
  base: './',
  server: {
    open: 'index.html',
  },
  build: {
    rollupOptions: {
      output: {
        format: 'es'
      }
    }
  },
  worker: {
    format: 'es'
  },
  optimizeDeps: {
    exclude: [
      '@niivue/niimath',
      '@itk-wasm/downsample',
    ]
  }
})