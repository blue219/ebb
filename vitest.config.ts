import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    setupFiles: ['./tests/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: [
        'src/shared/**/*.ts',
        'electron/shared/**/*.ts',
        'electron/platforms/douyin/policy.ts',
        'electron/platforms/douyin/login-surface.ts',
        'electron/platforms/douyin/parsers.ts',
        'electron/platforms/douyin/task-service.ts',
        'electron/platforms/douyin/preload-bridge.ts',
        'electron/platforms/douyin/ipc-handlers.ts',
      ],
      exclude: ['**/*.test.ts', '**/*.test.tsx'],
      thresholds: {
        lines: 80,
        statements: 80,
        functions: 80,
        branches: 70,
      },
    },
  },
})
