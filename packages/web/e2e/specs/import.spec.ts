import { test, expect, waitForWorkspaceReady } from '../fixtures/base';
import type { Page } from '@playwright/test';

/**
 * 產生一個 inline CSV buffer 拿來上傳，不需要實體檔案。
 * 欄位順序照 test-data/wedding-*.csv 的格式。
 */
function makeCsv(names: Array<{ name: string; category: string }>): {
  name: string;
  mimeType: string;
  buffer: Buffer;
} {
  const header = '是否參加,姓名,暱稱,分類,子分類,眷屬,葷素,想同桌人選,避免同桌,備註';
  const rows = names.map((g) => `是,${g.name},,${g.category},家人,0,,,,`);
  return {
    name: 'e2e-test.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from([header, ...rows].join('\n'), 'utf-8'),
  };
}

/**
 * 走完上傳 → preview → 確認匯入 的流程，回傳新賓客的名字清單。
 * 匯入完會自動 navigate 回 /，呼叫端只要 waitForWorkspaceReady 就能看到結果。
 */
async function importCsv(page: Page, names: Array<{ name: string; category: string }>): Promise<void> {
  await page.goto('/import');
  // 等 input 步驟的卡片出現
  await expect(page.getByText('本機上傳')).toBeVisible({ timeout: 10_000 });

  // hidden file input 直接 setInputFiles
  await page.locator('input[type="file"]').setInputFiles(makeCsv(names));

  // 進 preview 步驟
  await expect(page.getByTestId('import-preview-confirm')).toBeVisible({ timeout: 10_000 });

  // 按確認。匯入完成後 doImport 會呼叫 navigate('/')，等 workspace 重新就緒
  await page.getByTestId('import-preview-confirm').click();
  await waitForWorkspaceReady(page);
}

test.describe('Import', () => {
  test('I1: 上傳 CSV → preview → 確認 → 新賓客出現在待排區', async ({ page }) => {
    await page.goto('/');
    await waitForWorkspaceReady(page);

    const stamp = Date.now();
    const guests = [
      { name: `E2E_I1_${stamp}_A`, category: '男方' },
      { name: `E2E_I1_${stamp}_B`, category: '男方' },
      { name: `E2E_I1_${stamp}_C`, category: '女方' },
    ];

    await importCsv(page, guests);

    const unassignedBar = page.getByTestId('unassigned-bar');
    for (const g of guests) {
      await expect(unassignedBar.getByText(g.name)).toBeVisible({ timeout: 5_000 });
    }
  });

  test('I2: 匯入後 /guests 列表包含新賓客 + category 正確', async ({ page }) => {
    await page.goto('/');
    await waitForWorkspaceReady(page);

    const stamp = Date.now();
    const name1 = `E2E_I2_${stamp}_男方`;
    const name2 = `E2E_I2_${stamp}_女方`;
    await importCsv(page, [
      { name: name1, category: '男方' },
      { name: name2, category: '女方' },
    ]);

    // 導到 /guests 檢查 row
    await page.getByRole('button', { name: '賓客名單' }).click();
    await expect(page.locator('[data-guest-row-id]').first()).toBeVisible({ timeout: 10_000 });

    const row1 = page.locator('[data-guest-row-id]').filter({ hasText: name1 });
    await expect(row1).toContainText('男方');

    const row2 = page.locator('[data-guest-row-id]').filter({ hasText: name2 });
    await expect(row2).toContainText('女方');
  });

  test('I3: 匯入不自動補桌次（8504598 regression）', async ({ page }) => {
    await page.goto('/');
    await waitForWorkspaceReady(page);

    const unassignedBar = page.getByTestId('unassigned-bar');
    // 只算 main guest（不含眷屬 companion），避免 companion count 打亂統計
    const seatedMain = page.locator('[data-seated-guest-id][data-seated-is-companion="0"]');

    const unassignedBefore = await unassignedBar.locator('[data-guest-id]').count();
    const seatedBefore = await seatedMain.count();

    const stamp = Date.now();
    const guests = [
      { name: `E2E_I3_${stamp}_A`, category: '男方' },
      { name: `E2E_I3_${stamp}_B`, category: '男方' },
      { name: `E2E_I3_${stamp}_C`, category: '女方' },
    ];
    await importCsv(page, guests);

    // 待排區 +3（全部進待排區，沒被自動分桌）
    await expect(unassignedBar.locator('[data-guest-id]')).toHaveCount(unassignedBefore + 3, { timeout: 5_000 });
    // 桌上的 main 賓客數量不變
    await expect(seatedMain).toHaveCount(seatedBefore);
  });

  test('I4: 匯入後 hard reload → 新賓客還在（reloadEvent 有正確更新快取）', async ({ page }) => {
    await page.goto('/');
    await waitForWorkspaceReady(page);

    const stamp = Date.now();
    const name = `E2E_I4_${stamp}`;
    await importCsv(page, [{ name, category: '男方' }]);

    // 確認在待排區
    const unassignedBar = page.getByTestId('unassigned-bar');
    await expect(unassignedBar.getByText(name)).toBeVisible({ timeout: 5_000 });

    // Hard reload
    await page.reload();
    await waitForWorkspaceReady(page);

    // 同一個名字還在 —— 代表 reloadEvent 有把新賓客寫進 localStorage 快取
    await expect(unassignedBar.getByText(name)).toBeVisible({ timeout: 5_000 });
  });
});
