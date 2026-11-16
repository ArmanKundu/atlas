import { resolve } from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'electron-vite'

const shared = resolve(__dirname, 'src/shared')

export default defineConfig({
  main: {
    resolve: { alias: { '@shared': shared } },
    build: {
      rollupOptions: { input: resolve(__dirname, 'src/main/index.ts') },
    },
  },
  preload: {
    resolve: { alias: { '@shared': shared } },
    build: {
      // The renderer is sandboxed, so the preload must be one self-contained CommonJS file.
      externalizeDeps: false,
      rollupOptions: {
        input: resolve(__dirname, 'src/preload/index.ts'),
        output: { format: 'cjs', entryFileNames: 'index.js' },
      },
    },
  },
  renderer: {
    root: resolve(__dirname, 'src/renderer'),
    resolve: {
      alias: { '@shared': shared, '@': resolve(__dirname, 'src/renderer') },
    },
    plugins: [react(), tailwindcss()],
    build: {
      minify: true,
      rollupOptions: { input: resolve(__dirname, 'src/renderer/index.html') },
    },
  },
})
