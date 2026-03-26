/**
 * 圓桌座位位移演算法
 *
 * 規則：
 * 1. 拖到空位 → 直接放
 * 2. 拖到有人的位子（有空位）→ 往連續佔位較少的方向位移
 * 3. 拖到有人的位子（滿桌）→ 不允許
 *
 * 位移方向判斷：
 * - 從目標座位出發，左右分別數連續佔位數（不含目標本身），環形繞回直到空位
 * - 較少的那邊位移
 * - 平手時由 cursorBias 決定（拖曳時游標靠左/右）
 *
 * 眷屬（attendeeCount > 1）佔連續座位，位移時整組一起移動
 */

/** 每個 slot 的佔用狀態 */
export interface SlotOccupant {
  guestId: string
  isCompanion: boolean // true = 眷屬位, false = 本人
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
    for (let i = 0; i < g.attendeeCount; i++) {
      const idx = (g.seatIndex + i) % capacity
      if (idx < capacity) {
        slots[idx] = { guestId: g.id, isCompanion: i > 0 }
      }
    }
  }

  return slots
}

/**
 * 判斷桌子是否有空位可位移
 */
export function hasEmptySlot(slots: Slot[]): boolean {
  return slots.some((s) => s === null)
}

/**
 * 計算從 targetIndex 出發，某方向的連續佔位數（不含 target 本身）
 * direction: 1 = 右（順時針）, -1 = 左（逆時針）
 */
function countConsecutive(slots: Slot[], targetIndex: number, direction: 1 | -1): number {
  const len = slots.length
  let count = 0
  let idx = (targetIndex + direction + len) % len

  while (idx !== targetIndex && slots[idx] !== null) {
    count++
    idx = (idx + direction + len) % len
  }

  return count
}

/**
 * 計算位移方向
 * 回傳 'left' | 'right'，或 null 表示無法位移（滿桌）
 */
export function computeShiftDirection(
  slots: Slot[],
  targetIndex: number,
  cursorBias?: 'left' | 'right',
): 'left' | 'right' | null {
  // 空位不需位移
  if (slots[targetIndex] === null) return null

  // 滿桌
  if (!hasEmptySlot(slots)) return null

  const rightCount = countConsecutive(slots, targetIndex, 1)
  const leftCount = countConsecutive(slots, targetIndex, -1)

  if (rightCount < leftCount) return 'right'
  if (leftCount < rightCount) return 'left'

  // 平手：用 cursorBias
  return cursorBias || 'right'
}

/**
 * 執行位移，回傳新的 slot 陣列
 * 從 targetIndex 往 direction 方向，把連續佔位的 slot 各移一格，空出 targetIndex
 */
export function applyShift(
  slots: Slot[],
  targetIndex: number,
  direction: 'left' | 'right',
): Slot[] {
  const len = slots.length
  const newSlots = [...slots]
  const step = direction === 'right' ? 1 : -1

  // 從 targetIndex 出發往 direction 方向找到第一個空位
  let emptyIdx = (targetIndex + step + len) % len
  while (newSlots[emptyIdx] !== null) {
    emptyIdx = (emptyIdx + step + len) % len
  }

  // 從空位往回搬，每個 slot 移動一格
  let current = emptyIdx
  const reverseStep = -step
  let next = (current + reverseStep + len) % len

  while (current !== targetIndex) {
    newSlots[current] = newSlots[next]
    current = next
    next = (current + reverseStep + len) % len
  }

  // 目標位清空
  newSlots[targetIndex] = null

  return newSlots
}

export interface ShiftResult {
  /** 位移後的 slot 陣列（targetIndex 已空出） */
  slots: Slot[]
  /** 位移方向 */
  direction: 'left' | 'right'
}

/**
 * 計算位移結果
 * 回傳 null 表示無法位移（滿桌），或目標位已空
 */
export function computeShift(
  slots: Slot[],
  targetIndex: number,
  cursorBias?: 'left' | 'right',
): ShiftResult | null {
  // 目標位是空的，不需位移
  if (slots[targetIndex] === null) return null

  const direction = computeShiftDirection(slots, targetIndex, cursorBias)
  if (direction === null) return null

  return {
    slots: applyShift(slots, targetIndex, direction),
    direction,
  }
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
 * 檢查拖入的賓客（含眷屬）能否放入指定座位
 * - 目標位是空位：檢查連續空位夠不夠放眷屬
 * - 目標位有人：先位移，再檢查空出的位子夠不夠
 */
export function canPlaceGuest(
  slots: Slot[],
  targetIndex: number,
  attendeeCount: number,
  cursorBias?: 'left' | 'right',
): boolean {
  const len = slots.length

  // 先確認有足夠空位（含即將空出的位子）
  const emptyCount = slots.filter((s) => s === null).length
  if (emptyCount < attendeeCount) return false

  let workingSlots: Slot[]

  if (slots[targetIndex] === null) {
    workingSlots = [...slots]
  } else {
    const shift = computeShift(slots, targetIndex, cursorBias)
    if (!shift) return false
    workingSlots = shift.slots
  }

  // 從 targetIndex 開始，檢查連續 attendeeCount 個位子都是空的
  // （位移後 targetIndex 已空，但眷屬需要相鄰空位）
  for (let i = 0; i < attendeeCount; i++) {
    const idx = (targetIndex + i) % len
    if (workingSlots[idx] !== null) return false
  }

  return true
}

/**
 * 完整的放置操作：位移 + 放入賓客（含眷屬）
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

  let workingSlots = [...slots]

  // 如果要放多個位子，可能需要多次位移
  for (let i = 0; i < attendeeCount; i++) {
    const idx = (targetIndex + i) % len
    if (workingSlots[idx] !== null) {
      const shift = computeShift(workingSlots, idx, cursorBias)
      if (!shift) return null
      workingSlots = shift.slots
    }
  }

  // 放入賓客
  for (let i = 0; i < attendeeCount; i++) {
    const idx = (targetIndex + i) % len
    workingSlots[idx] = { guestId, isCompanion: i > 0 }
  }

  return workingSlots
}
