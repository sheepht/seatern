import { test as base, type Page } from '@playwright/test';

/**
 * 每個 test 都拿到一個新 browser context（Playwright 預設），
 * localStorage 本來就是空的。這個 fixture 純粹只暴露 test。
 */
export const test = base.extend({});

export { expect } from '@playwright/test';

/**
 * 等到 workspace 真的 ready 才回傳：
 * 1. 兩個 loading 文字都消失
 * 2. 至少有一個 guest chip 存在（demo data 已載入完成）
 * 3. 至少有一張桌子 render 出來
 *
 * 為什麼需要：demo data 是透過 server-side clone-demo 非同步載入的，
 * 「載入中...」消失不代表 guest 資料已經在 DOM 上。測試直接用 .count()
 * 而不是 toBeVisible() 時會撞到 race condition。所有 test 在 goto('/') 後
 * 都要呼叫這個 helper 再進 test 邏輯。
 */
export async function waitForWorkspaceReady(page: Page): Promise<void> {
  const { expect } = await import('@playwright/test');
  // 30s timeout：boot event + clone-demo + reloadEvent 三段非同步 API 串起來，
  // 冷啟動（Prisma 連線池熱身）偶爾會超過 15s。設寬一點避免 flaky。
  await expect(page.getByText('載入中...')).toBeHidden({ timeout: 30_000 });
  await expect(page.getByText('載入展示用賓客...')).toBeHidden({ timeout: 30_000 });

  // 桌子用 count > 0 檢查而不是 toBeVisible。
  // 原因：[data-table-id] 是 SVG <g>，它的 bounding box 在 React render / 動畫期間
  // 可能暫時是 0×0，Playwright 的 toBeVisible 會誤判為不可見。用 toHaveCount 只查
  // DOM 是否存在，不碰 bounding box 計算，就不會 flaky。
  await expect(page.locator('[data-table-id]')).not.toHaveCount(0, { timeout: 30_000 });

  // 賓客 chip / overlay 是 HTML 元素，toBeVisible 可靠
  await expect(page.locator('[data-guest-id], [data-seated-guest-id]').first()).toBeVisible({ timeout: 30_000 });

  // 等網路靜止，確保所有非同步 request（clone-demo + reloadEvent）都完成
  await page.waitForLoadState('networkidle');
}
