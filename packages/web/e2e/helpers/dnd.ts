import type { Page, Locator } from '@playwright/test';

/**
 * @dnd-kit 專用拖曳 helper。
 *
 * 為什麼不能用 Playwright 內建的 page.dragTo() / locator.dragTo()：
 * WorkspacePage 的 PointerSensor 設定 activationConstraint: { distance: 5 }，
 * 意思是「按下滑鼠後要移動超過 5px 才算開始拖曳」。Playwright 內建 dragTo
 * 會 mousedown → 直接 move 到終點 → mouseup，中間只有一次 move 事件，
 * dnd-kit 判定沒有位移量，拖曳不會 activate。
 *
 * 正確做法：
 * 1. 滑鼠移到 source 中心
 * 2. mouseDown
 * 3. 先做一次小位移（>= 5px）觸發 activationConstraint
 * 4. 再分段移到 target，讓 dnd-kit 能追蹤 drag over 事件
 * 5. mouseUp 在 target
 */
export async function dndDrag(page: Page, source: Locator, target: Locator): Promise<void> {
  const src = await source.boundingBox();
  const tgt = await target.boundingBox();
  if (!src) throw new Error('dndDrag: source element has no bounding box (invisible?)');
  if (!tgt) throw new Error('dndDrag: target element has no bounding box (invisible?)');

  const srcX = src.x + src.width / 2;
  const srcY = src.y + src.height / 2;
  const tgtX = tgt.x + tgt.width / 2;
  const tgtY = tgt.y + tgt.height / 2;

  await page.mouse.move(srcX, srcY);
  await page.mouse.down();
  // 觸發 activationConstraint (distance: 5)；動 10px 留安全邊際
  await page.mouse.move(srcX + 10, srcY + 10, { steps: 5 });
  // 給 dnd-kit 一個 tick 把 onDragStart 跑完
  await page.waitForTimeout(50);
  // 分段移動到目標，讓 dnd-kit 的 onDragOver 能連續 track
  await page.mouse.move(tgtX, tgtY, { steps: 25 });
  // 停在目標上讓 onDragOver 穩定
  await page.waitForTimeout(50);
  await page.mouse.up();
  // 等 onDragEnd 的 state update 完成
  await page.waitForTimeout(100);
}
