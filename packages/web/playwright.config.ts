import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e/specs',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 1,
  workers: 1,
  reporter: process.env.CI
    ? [['html', { open: 'never' }], ['github']]
    : [['list'], ['html', { open: 'never' }]],
  timeout: 30_000,
  expect: { timeout: 5_000 },

  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on',
    screenshot: 'only-on-failure',
    video: 'on',
  },

  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // 1920×1080 給 FloorPlan 足夠空間，避免桌子被擠到 viewport 外
        // 造成拖曳 source/target 座標在可視區外的 flaky
        viewport: { width: 1920, height: 1080 },
      },
    },
  ],

  // webServer 刻意不設定。跑 E2E 前請自行在另一個 terminal 起 API + web：
  //   npm run dev           # 或分別跑 npm run dev:api + npm run dev:web
  // 想讓 E2E 走本地 DB 就用：
  //   tsx --env-file=.env.local watch packages/api/src/index.ts
});
