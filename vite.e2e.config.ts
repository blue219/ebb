import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    ssr: 'tests/e2e/electron-main.ts',
    outDir: 'dist-e2e',
    emptyOutDir: true,
    rollupOptions: {
      external: ['electron'],
      output: { entryFileNames: 'main.mjs' },
    },
  },
})
