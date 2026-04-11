import { test, expect, waitForWorkspaceReady } from '../fixtures/base';
import type { Locator, Page } from '@playwright/test';

/**
 * Helper：等 /guests 頁面就緒（demo data 載完 + 至少一列賓客 row）
 */
async function gotoGuestList(page: Page) {
  await page.goto('/');
  await waitForWorkspaceReady(page);
  await page.goto('/guests');
  await expect(page.locator('[data-guest-row-id]').first()).toBeVisible({ timeout: 15_000 });
}

/**
 * 點開一列賓客的 edit modal。
 *
 * 直接 row.click() 會打到中央那一格（RSVP / 攜眷 cell 有 e.stopPropagation），
 * row 的 onClick 收不到事件，modal 不會開。改點第一個 td（姓名 cell）就 OK。
 */
async function clickRowToEdit(row: Locator, page: Page): Promise<Locator> {
  await row.locator('td').first().click();
  const modal = page.getByTestId('guest-form-modal');
  await expect(modal).toBeVisible({ timeout: 5_000 });
  return modal;
}

/**
 * 在 FieldInput（draft/commit 語意的 input）填值。
 *
 * FieldInput 的 onChange 只更新內部 draft state，onBlur 才 commit 到父層。
 * Playwright 的 .fill() 只觸發 onChange，父層 state 不會更新 → 依賴 name 的
 * disabled 邏輯還是鎖住。先 fill 再按 Tab 觸發 blur 讓 draft commit 上去。
 */
async function fillFieldInput(input: Locator, value: string): Promise<void> {
  await input.fill(value);
  await input.press('Tab');
}

test.describe('Guest management', () => {
  test('G1: 進入 /guests 看到範例賓客列表', async ({ page }) => {
    await gotoGuestList(page);
    const rowCount = await page.locator('[data-guest-row-id]').count();
    expect(rowCount).toBeGreaterThan(5);
  });

  test('G2: 點賓客 → 改姓名 → 儲存 → 列表立即更新', async ({ page }) => {
    await gotoGuestList(page);

    const firstRow = page.locator('[data-guest-row-id]').first();
    const guestId = await firstRow.getAttribute('data-guest-row-id');
    expect(guestId).toBeTruthy();

    const modal = await clickRowToEdit(firstRow, page);

    // 第一個 input = 姓名欄位
    const nameInput = modal.locator('input').first();
    const newName = `E2E改名_${Date.now()}`;
    await fillFieldInput(nameInput, newName);

    await modal.getByRole('button', { name: '儲存變更' }).click();
    await expect(modal).toBeHidden({ timeout: 5_000 });

    const updatedRow = page.locator(`[data-guest-row-id="${guestId}"]`);
    await expect(updatedRow).toContainText(newName, { timeout: 5_000 });
  });

  test('G3: 新增賓客 → 出現在列表和待排區', async ({ page }) => {
    await gotoGuestList(page);

    const countBefore = await page.locator('[data-guest-row-id]').count();

    await page.getByTestId('guest-list-add-button').click();
    const modal = page.getByTestId('guest-form-modal');
    await expect(modal).toBeVisible();

    const newName = `E2E新賓客_${Date.now()}`;
    await fillFieldInput(modal.locator('input').first(), newName);

    // add 模式下 modal 送出按鈕文字是「新增賓客」，scope 到 modal 內避免撞到
    // floating button / modal title。
    await modal.getByRole('button', { name: '新增賓客' }).click();
    await expect(modal).toBeHidden({ timeout: 5_000 });

    await expect(page.locator('[data-guest-row-id]')).toHaveCount(countBefore + 1, { timeout: 5_000 });
    await expect(page.getByText(newName).first()).toBeVisible();

    // 切回 workspace 確認新賓客在待排區
    await page.goto('/');
    await waitForWorkspaceReady(page);
    const unassignedBar = page.getByTestId('unassigned-bar');
    await expect(unassignedBar.getByText(newName).first()).toBeVisible({ timeout: 5_000 });
  });

  test('G4: 刪除賓客 → 列表和畫布都消失（驗證 ab32fb7 修過的 reloadEvent）', async ({ page }) => {
    await gotoGuestList(page);

    const firstRow = page.locator('[data-guest-row-id]').first();
    const guestId = await firstRow.getAttribute('data-guest-row-id');
    expect(guestId).toBeTruthy();

    const modal = await clickRowToEdit(firstRow, page);
    await modal.getByRole('button', { name: '刪除賓客' }).click();
    await expect(modal).toBeHidden({ timeout: 5_000 });

    // 如果賓客有桌次，handleDelete 會跳第二個確認對話框（DeleteConfirmModal）。
    const confirm = page.getByTestId('delete-guest-confirm');
    if (await confirm.isVisible().catch(() => false)) {
      // 第 1 個 button = 取消，第 2 個 button = 刪除
      await confirm.locator('button').nth(1).click();
    }

    await expect(page.locator(`[data-guest-row-id="${guestId}"]`)).toHaveCount(0, { timeout: 5_000 });

    // 切到 workspace 用 Toolbar 的「排位畫布」tab（SPA 導覽，保留 store state）。
    // 不能用 page.goto('/')——那是 hard reload，會從 localStorage 快取讀回舊資料，
    // 剛好撞到 soft delete 的已知 cache-stale 問題。
    await page.getByRole('button', { name: '排位畫布' }).click();
    await expect(page.getByTestId('unassigned-bar')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator(`[data-guest-id="${guestId}"]`)).toHaveCount(0);
    await expect(page.locator(`[data-seated-guest-id="${guestId}"]`)).toHaveCount(0);
  });

  test('G5: 清空所有賓客 → 列表和畫布都空（驗證 47d5245 修過的 reloadEvent）', async ({ page }) => {
    await gotoGuestList(page);

    await page.getByRole('button', { name: '刪除所有賓客' }).click();

    // confirm dialog 裡的「刪除」按鈕——每列 row 都有 title="刪除" 的 icon button，
    // 全頁 57 個 match，必須 scope 到 confirm dialog 內。
    const confirm = page.getByTestId('clear-all-confirm');
    await expect(confirm).toBeVisible();
    // 第 1 個 button = 取消，第 2 個 button = 刪除
    await confirm.locator('button').nth(1).click();

    await expect(page.locator('[data-guest-row-id]')).toHaveCount(0, { timeout: 10_000 });

    // 切到 workspace 驗證 localStorage 快取有被繞過
    await page.goto('/');
    // 不能用 waitForWorkspaceReady——它會等 guest 出現，但現在應該 0 個
    await expect(page.getByText('載入中...')).toBeHidden({ timeout: 15_000 });
    await expect(page.getByText('載入展示用賓客...')).toBeHidden({ timeout: 15_000 });

    const unassignedBar = page.getByTestId('unassigned-bar');
    await expect(unassignedBar).toBeVisible();
    await expect(unassignedBar.locator('[data-guest-id]')).toHaveCount(0);
    await expect(page.locator('[data-seated-guest-id]')).toHaveCount(0);
  });
});
