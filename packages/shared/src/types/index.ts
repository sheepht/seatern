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
