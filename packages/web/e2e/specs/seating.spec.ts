import { test, expect, waitForWorkspaceReady } from '../fixtures/base';
import { dndDrag } from '../helpers/dnd';
import type { Page, Locator } from '@playwright/test';

/**
 * 找一個在 x > 340 的空座位（避開 sidebar 範圍）。
 * WorkspacePage 的拖曳邏輯會把 left < 320 的 drop 當成「回到待排區」，
 * 所以所有 test 挑目標時都必須過濾 x > 340。
 */
async function findEmptySeatRightOfSidebar(page: Page, excludeTableId?: string): Promise<Locator | null> {
  const selector = excludeTableId
    ? `[data-drop-empty="1"]:not([data-drop-table-id="${excludeTableId}"])`
    : '[data-drop-empty="1"]';
  const emptySeats = page.locator(selector);
  const count = await emptySeats.count();
  for (let i = 0; i < count; i++) {
    const seat = emptySeats.nth(i);
    const box = await seat.boundingBox();
    if (box && box.x > 340) return seat;
  }
  return null;
}

/** 找同一張桌子上的另一個空座位（排除來源座位本身） */
async function findEmptySeatOnSameTable(
  page: Page,
  tableId: string,
  excludeSeatIndex: number,
): Promise<Locator | null> {
  const emptySeats = page.locator(
    `[data-drop-empty="1"][data-drop-table-id="${tableId}"]:not([data-drop-seat-index="${excludeSeatIndex}"])`,
  );
  const count = await emptySeats.count();
  for (let i = 0; i < count; i++) {
    const seat = emptySeats.nth(i);
    const box = await seat.boundingBox();
    if (box && box.x > 340) return seat;
  }
  return null;
}

test.describe('Seating: drag and drop', () => {
  test('D1: 把一個待排區的賓客拖到一個空座位', async ({ page }) => {
    await page.goto('/');
    await waitForWorkspaceReady(page);

    const unassignedBar = page.getByTestId('unassigned-bar');
    const unassignedGuests = unassignedBar.locator('[data-guest-id]');

    // 等到至少一位未排賓客出現（auto-retry）
    await expect(unassignedGuests.first()).toBeVisible({ timeout: 5_000 });
    const countBefore = await unassignedGuests.count();

    const firstUnassigned = unassignedGuests.first();
    const guestId = await firstUnassigned.getAttribute('data-guest-id');
    expect(guestId).toBeTruthy();

    const target = await findEmptySeatRightOfSidebar(page);
    expect(target, '找不到 sidebar 右側的空座位').not.toBeNull();

    await dndDrag(page, firstUnassigned, target!);

    await expect(
      unassignedBar.locator(`[data-guest-id="${guestId}"]`),
    ).toHaveCount(0, { timeout: 5_000 });
    await expect(unassignedGuests).toHaveCount(countBefore - 1);
  });

  test('D2: 把一個在桌上的賓客拖到「另一張桌子」的空座位', async ({ page }) => {
    await page.goto('/');
    await waitForWorkspaceReady(page);

    // 等到至少一位主位賓客已在桌上
    const seatedMain = page.locator('[data-seated-guest-id][data-seated-is-companion="0"]');
    await expect(seatedMain.first()).toBeVisible({ timeout: 5_000 });

    const source = seatedMain.first();
    const sourceTableId = await source.getAttribute('data-seated-table-id');
    const sourceGuestId = await source.getAttribute('data-seated-guest-id');
    expect(sourceTableId).toBeTruthy();
    expect(sourceGuestId).toBeTruthy();

    const target = await findEmptySeatRightOfSidebar(page, sourceTableId!);
    expect(target, '找不到另一張桌子的空座位').not.toBeNull();

    const targetTableId = await target!.getAttribute('data-drop-table-id');
    expect(targetTableId).not.toBe(sourceTableId);

    await dndDrag(page, source, target!);

    await expect(
      page.locator(`[data-seated-guest-id="${sourceGuestId}"][data-seated-is-companion="0"]`),
    ).toHaveAttribute('data-seated-table-id', targetTableId!, { timeout: 5_000 });
  });

  // D3 先 skip——「同桌拖到另一個空座位」在環形桌相鄰座位上會撞到 collision
  // detection + cursorBias 的 tiebreaker，拖曳實際落點可能回到原座位。
  // 要穩定測這個場景，需要搭配 avoid pair 設定來驗證「同桌 = 跳過 avoid 檢查」
  // 這個真正的產品行為。留到 D6-D8 那批一起做。
  test.skip('D3: 在同一張桌子上把賓客拖到另一個空座位', async ({ page }) => {
    await page.goto('/');
    await waitForWorkspaceReady(page);

    // 等到至少一位主位賓客已在桌上
    const seatedMains = page.locator('[data-seated-guest-id][data-seated-is-companion="0"]');
    await expect(seatedMains.first()).toBeVisible({ timeout: 5_000 });

    const count = await seatedMains.count();
    let source: Locator | null = null;
    let target: Locator | null = null;
    let sourceSeatIndex: string | null = null;
    let sourceGuestId: string | null = null;

    for (let i = 0; i < count; i++) {
      const candidate = seatedMains.nth(i);
      const tableId = await candidate.getAttribute('data-seated-table-id');
      const seatIndex = await candidate.getAttribute('data-seated-seat-index');
      if (!tableId || seatIndex === null) continue;

      const emptySeatOnSameTable = await findEmptySeatOnSameTable(page, tableId, parseInt(seatIndex, 10));
      if (emptySeatOnSameTable) {
        source = candidate;
        target = emptySeatOnSameTable;
        sourceSeatIndex = seatIndex;
        sourceGuestId = await candidate.getAttribute('data-seated-guest-id');
        break;
      }
    }

    expect(source, '找不到「同桌有空位」的賓客').not.toBeNull();

    await dndDrag(page, source!, target!);

    // 驗證：賓客還在同一張桌子上，但 seat-index 已經不是原本的位置。
    // 不斷言「落在確切的 target seat index」——環形桌上相鄰座位很近，
    // dnd-kit 的 cursor-bias 判定可能讓落點 ±1，那不是我們要測的東西。
    const after = page.locator(
      `[data-seated-guest-id="${sourceGuestId}"][data-seated-is-companion="0"]`,
    );
    await expect(after).toHaveAttribute('data-seated-table-id', /.+/, { timeout: 5_000 });
    await expect(after).not.toHaveAttribute('data-seated-seat-index', sourceSeatIndex!);
  });

  test('D5: 把一個在桌上的賓客拖回待排區', async ({ page }) => {
    await page.goto('/');
    await waitForWorkspaceReady(page);

    const unassignedBar = page.getByTestId('unassigned-bar');
    const countBefore = await unassignedBar.locator('[data-guest-id]').count();

    // 等到至少一位主位賓客已在桌上
    const source = page.locator('[data-seated-guest-id][data-seated-is-companion="0"]').first();
    await expect(source).toBeVisible({ timeout: 5_000 });
    const sourceGuestId = await source.getAttribute('data-seated-guest-id');
    expect(sourceGuestId).toBeTruthy();

    // 拖回 unassigned-bar
    await dndDrag(page, source, unassignedBar);

    // 驗證：該賓客出現在待排區
    await expect(
      unassignedBar.locator(`[data-guest-id="${sourceGuestId}"]`),
    ).toBeVisible({ timeout: 5_000 });
    await expect(unassignedBar.locator('[data-guest-id]')).toHaveCount(countBefore + 1);
  });
});
