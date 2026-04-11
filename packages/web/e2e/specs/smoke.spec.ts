import { test, expect, waitForWorkspaceReady } from '../fixtures/base';

test.describe('Smoke: boot and demo data', () => {
  test('S1: 首次進入 / 自動 boot event 並載入範例資料', async ({ page }) => {
    await page.goto('/');
    await waitForWorkspaceReady(page);

    // 至少一張桌子 render 出來
    await expect(page.locator('[data-table-id]').first()).toBeVisible();

    // 至少一個賓客 chip 存在（sidebar 或桌上都算）
    await expect(page.locator('[data-guest-id], [data-seated-guest-id]').first()).toBeVisible();

    // 待排區存在
    await expect(page.getByTestId('unassigned-bar')).toBeVisible();
  });

  test('S2: reload 後賓客資料還在（localStorage 快取生效）', async ({ page }) => {
    await page.goto('/');
    await waitForWorkspaceReady(page);

    // 記下第一個賓客的 id（sidebar 或桌上）
    const firstGuest = page.locator('[data-guest-id], [data-seated-guest-id]').first();
    const guestId = (await firstGuest.getAttribute('data-guest-id'))
      ?? (await firstGuest.getAttribute('data-seated-guest-id'));
    expect(guestId).toBeTruthy();

    // reload
    await page.reload();
    await waitForWorkspaceReady(page);

    // 同一個賓客 id 還在（不管在 sidebar 還是桌上）
    await expect(
      page.locator(`[data-guest-id="${guestId}"], [data-seated-guest-id="${guestId}"]`).first(),
    ).toBeVisible();
  });

  test('S3: 按 Q 鍵收合側邊欄再按 Q 展開', async ({ page }) => {
    await page.goto('/');
    await waitForWorkspaceReady(page);

    const unassigned = page.getByTestId('unassigned-bar');
    await expect(unassigned).toBeVisible();
    await expect(unassigned).toBeInViewport();

    // 按 Q 收合：整個被推出畫面
    await page.keyboard.press('q');
    await expect(unassigned).not.toBeInViewport();

    // 再按 Q 展開
    await page.keyboard.press('q');
    await expect(unassigned).toBeInViewport();
  });
});
