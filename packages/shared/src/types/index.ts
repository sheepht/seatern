/**
 * @seatern/shared — 前後端共用的原子型別
 *
 * 這些是最基礎的型別定義，前後端各自 import 後
 * 可再 extend / Pick / Omit 組合成自己需要的型別。
 */

// ─── 列舉 ──────────────────────────────────────────

export type RsvpStatus = 'confirmed' | 'declined'
export type EventType = 'wedding' | 'banquet' | 'corporate' | 'other'

// ─── 基礎實體 ──────────────────────────────────────

export interface Subcategory {
  id: string
  name: string
  category: string
}

export interface AvoidPair {
  id: string
  guestAId: string
  guestBId: string
  reason: string | null
}

export interface SeatPreference {
  preferredGuestId: string
  rank: number
}

// ─── API 共用 payload ──────────────────────────────

/** batch create guests 的回傳單筆 */
export interface CreatedGuest {
  id: string
  name: string
}

/** 建立賓客（單筆 / batch 每筆） */
export interface CreateGuestPayload {
  name: string
  aliases?: string[]
  category?: string
  rsvpStatus?: string
  companionCount?: number
  dietaryNote?: string
  specialNote?: string
}

/** 建立桌次 */
export interface CreateTablePayload {
  name: string
  capacity?: number
  positionX?: number
  positionY?: number
}

/** 批次座位分配 */
export interface AssignSeatsBatchPayload {
  assignments: Array<{
    guestId: string
    tableId: string | null
    seatIndex?: number | null
  }>
}

/** 批次座位偏好 */
export interface PreferenceBatchPayload {
  preferences: Array<{
    guestId: string
    preferredGuestId: string
    rank: number
  }>
}

/** 批次避免同桌 */
export interface AvoidPairBatchPayload {
  pairs: Array<{
    guestAId: string
    guestBId: string
    reason?: string
  }>
}

/** 批次子分類指定 */
export interface SubcategoryBatchPayload {
  assignments: Array<{
    guestId: string
    subcategoryName: string
    category: string
  }>
}

// ─── 快照 ──────────────────────────────────────────

export interface SnapshotGuestEntry {
  guestId: string
  tableId: string
  satisfactionScore: number
  isOverflow: boolean
}

export interface SnapshotTableEntry {
  tableId: string
  positionX: number
  positionY: number
}

export interface SnapshotData {
  guests: SnapshotGuestEntry[]
  tables: SnapshotTableEntry[]
}
