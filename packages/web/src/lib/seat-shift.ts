/**
 * 圓桌座位位移演算法
 *
 * 規則：
 * 1. 拖到空位 → 直接放
 * 2. 拖到單人賓客的位子（有空位可達）→ 往連續單人佔位較少的方向位移
 * 3. 拖到帶眷屬賓客的位子 → 不允許
 * 4. 滿桌或被帶眷屬賓客擋住（兩邊都不可達）→ 不允許
 *
 * 帶眷屬賓客（attendeeCount > 1）視為不可移動的牆壁。
 * 位移只會移動單人賓客（attendeeCount = 1）。
 */

/** 每個 slot 的佔用狀態 */
export interface SlotOccupant {
  guestId: string
  isCompanion: boolean
  /** 此賓客帶眷屬 → 不可被位移（視為牆壁） */
  immovable: boolean
}

export type Slot = SlotOccupant | null

/**
 * 從 guests（含 seatIndex）建立 slot 陣列
 */
export function buildSlotArray(
  guests: Array<{ id: string; seatIndex: number; attendeeCount: number }>,
  capacity: number,
): Slot[] {
  const slots: Slot[] = new Array(capacity).fill(null)

  for (const g of guests) {
    const immovable = g.attendeeCount > 1
    for (let i = 0; i < g.attendeeCount; i++) {
      const idx = (g.seatIndex + i) % capacity
      if (idx < capacity) {
        slots[idx] = { guestId: g.id, isCompanion: i > 0, immovable }
      }
    }
  }

  return slots
}

/**
 * 從 targetIndex 往某方向數可位移的連續單人佔位數。
 * 遇到空位 → 回傳 count（可達）
 * 遇到不可移動的牆壁 → 回傳 -1（此方向不通）
 */
function countShiftable(slots: Slot[], targetIndex: number, direction: 1 | -1): number {
  const len = slots.length
  let count = 0
  let idx = (targetIndex + direction + len) % len

  while (idx !== targetIndex) {
    const slot = slots[idx]
    if (slot === null) return count // 找到空位，可達
    if (slot.immovable) return -1 // 被牆壁擋住，不通
    count++
    idx = (idx + direction + len) % len
  }

  return -1 // 繞了一圈，無路可走
}

/**
 * 計算位移方向
 */
function computeDirection(
  slots: Slot[],
  targetIndex: number,
  cursorBias?: 'left' | 'right',
): 'left' | 'right' | null {
  const slot = slots[targetIndex]
  if (slot === null) return null // 空位不需位移
  if (slot.immovable) return null // 不可移動

  const rightCount = countShiftable(slots, targetIndex, 1)
  const leftCount = countShiftable(slots, targetIndex, -1)

  // 兩邊都不通
  if (rightCount === -1 && leftCount === -1) return null
  // 只有一邊通
  if (rightCount === -1) return 'left'
  if (leftCount === -1) return 'right'
  // 兩邊都通，選較少的
  if (rightCount < leftCount) return 'right'
  if (leftCount < rightCount) return 'left'
  return cursorBias || 'right'
}

/**
 * 執行單格位移（只移動單人賓客，跳過不可移動的牆壁）
 */
function shiftSlot(
  slots: Slot[],
  targetIndex: number,
  direction: 'left' | 'right',
): Slot[] {
  const len = slots.length
  const result = [...slots]
  const step = direction === 'right' ? 1 : -1

  // 找到可達的空位（保證路上只有單人賓客）
  let emptyIdx = (targetIndex + step + len) % len
  while (result[emptyIdx] !== null) {
    emptyIdx = (emptyIdx + step + len) % len
  }

  // 從空位往回搬
  let current = emptyIdx
  const reverseStep = -step
  let next = (current + reverseStep + len) % len
  while (current !== targetIndex) {
    result[current] = result[next]
    current = next
    next = (current + reverseStep + len) % len
  }
  result[targetIndex] = null

  return result
}

/**
 * 從位移後的 slot 陣列，提取每位賓客的新 seatIndex
 */
export function extractSeatIndices(slots: Slot[]): Map<string, number> {
  const result = new Map<string, number>()
  for (let i = 0; i < slots.length; i++) {
    const slot = slots[i]
    if (slot && !slot.isCompanion) {
      result.set(slot.guestId, i)
    }
  }
  return result
}

/**
 * 完整的放置操作
 *
 * - 帶眷屬賓客不可移動（牆壁）
 * - 只位移單人賓客
 * - 多格放置（attendeeCount > 1）時，每格獨立檢查並統一方向位移
 *
 * 回傳新的 slot 陣列，或 null 表示無法放置
 */
export function placeGuest(
  slots: Slot[],
  targetIndex: number,
  guestId: string,
  attendeeCount: number,
  cursorBias?: 'left' | 'right',
): Slot[] | null {
  const len = slots.length

  // 檢查空位總數
  const emptyCount = slots.filter((s) => s === null).length
  if (emptyCount < attendeeCount) return null

  // 檢查目標區域：不可包含不可移動的牆壁
  for (let i = 0; i < attendeeCount; i++) {
    const idx = (targetIndex + i) % len
    const slot = slots[idx]
    if (slot !== null && slot.immovable) return null
  }

  let workingSlots = [...slots]

  // 統一決定方向（以第一個需要位移的格子為準）
  let direction: 'left' | 'right' | null = null
  for (let i = 0; i < attendeeCount; i++) {
    const idx = (targetIndex + i) % len
    if (workingSlots[idx] !== null) {
      direction = computeDirection(workingSlots, idx, cursorBias)
      break
    }
  }

  // 位移所有佔用的目標格
  // 'right'：從左往右處理，讓最左的賓客先推出右邊界，後面的依序跟上
  // 'left'：從右往左處理，讓最右的賓客先推出左邊界，前面的依序跟上
  if (direction !== null) {
    if (direction === 'right') {
      for (let i = 0; i < attendeeCount; i++) {
        const idx = (targetIndex + i) % len
        if (workingSlots[idx] !== null) {
          workingSlots = shiftSlot(workingSlots, idx, 'right')
        }
      }
    } else {
      for (let i = attendeeCount - 1; i >= 0; i--) {
        const idx = (targetIndex + i) % len
        if (workingSlots[idx] !== null) {
          workingSlots = shiftSlot(workingSlots, idx, 'left')
        }
      }
    }
  }

  // 驗證目標區域已全部清空
  for (let i = 0; i < attendeeCount; i++) {
    const idx = (targetIndex + i) % len
    if (workingSlots[idx] !== null) return null // 無法清空（不應發生）
  }

  // 放入賓客
  const immovable = attendeeCount > 1
  for (let i = 0; i < attendeeCount; i++) {
    const idx = (targetIndex + i) % len
    workingSlots[idx] = { guestId, isCompanion: i > 0, immovable }
  }

  return workingSlots
}

// ── 以下為向後相容的匯出（store 仍使用） ──

export function computeShiftDirection(
  slots: Slot[],
  targetIndex: number,
  cursorBias?: 'left' | 'right',
): 'left' | 'right' | null {
  return computeDirection(slots, targetIndex, cursorBias)
}

export function applyShift(
  slots: Slot[],
  targetIndex: number,
  direction: 'left' | 'right',
): Slot[] {
  return shiftSlot(slots, targetIndex, direction)
}

export interface ShiftResult {
  slots: Slot[]
  direction: 'left' | 'right'
}

export function computeShift(
  slots: Slot[],
  targetIndex: number,
  cursorBias?: 'left' | 'right',
): ShiftResult | null {
  if (slots[targetIndex] === null) return null
  const direction = computeDirection(slots, targetIndex, cursorBias)
  if (direction === null) return null
  return { slots: shiftSlot(slots, targetIndex, direction), direction }
}
