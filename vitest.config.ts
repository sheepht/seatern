import path from 'path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'packages/web/src'),
      '@seatern/shared': path.resolve(__dirname, 'packages/shared/src'),
      '@seatern/db': path.resolve(__dirname, 'packages/db'),
    },
  },
  test: {
    globals: true,
    setupFiles: ['packages/web/src/test-setup.ts'],
    include: [
      'packages/web/src/**/*.test.{ts,tsx}',
      'packages/api/src/**/*.test.ts',
    ],
    exclude: ['**/node_modules/**', '.claude/**'],
    environmentMatchGlobs: [
      ['packages/web/**', 'jsdom'],
      ['packages/api/**', 'node'],
    ],
  },
});
