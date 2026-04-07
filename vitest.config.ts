import path from 'path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'packages/web/src'),
      '@seatern/shared': path.resolve(__dirname, 'packages/shared/src'),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['packages/web/src/test-setup.ts'],
    include: ['packages/web/src/**/*.test.{ts,tsx}'],
    exclude: ['**/node_modules/**', '.claude/**'],
  },
});
