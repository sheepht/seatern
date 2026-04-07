/** 共用型別（主線程 + Web Worker 共用） */

export interface Guest {
  id: string
  name: string
  aliases: string[]
  category: string
  rsvpStatus: 'confirmed' | 'declined'
  companionCount: number
  /** 佔座位數 = companionCount + 1 */
  seatCount: number
  dietaryNote: string
  specialNote: string
  satisfactionScore: number
  assignedTableId: string | null
  seatIndex: number | null
  isOverflow: boolean
  isIsolated: boolean
  seatPreferences: Array<{ preferredGuestId: string; rank: number }>
  subcategory: { id: string; name: string } | null
}

export interface Table {
  id: string
  name: string
  capacity: number
  positionX: number
  positionY: number
  averageSatisfaction: number
  color: string | null
  note: string | null
}

export interface AvoidPair {
  id: string
  guestAId: string
  guestBId: string
  reason: string | null
}

export interface Subcategory {
  id: string
  name: string
  category: string
}

/** API batch create 回傳的簡化賓客 */
export type CreatedGuest = Pick<Guest, 'id' | 'name'>

/** 空位預覽賓客 */
export interface SeatPreviewGuest {
  tableId: string
  seatIndex: number
  guestId: string
  predictedScore: number
  category?: string
  name: string
  aliases: string[]
}