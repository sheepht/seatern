/**
 * 前端型別（主線程 + Web Worker 共用）
 *
 * 從 @seatern/shared 引入原子型別，
 * 再組合/擴展成前端 UI 需要的投射型別。
 */

export type {
  RsvpStatus,
  Subcategory,
  AvoidPair,
  SeatPreference,
  CreatedGuest,
} from '@seatern/shared';

import type { RsvpStatus, SeatPreference, Subcategory } from '@seatern/shared';

/** 前端賓客（從 API 投射，加上 UI 計算欄位） */
export interface Guest {
  id: string
  name: string
  aliases: string[]
  category: string
  rsvpStatus: RsvpStatus
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
  seatPreferences: SeatPreference[]
  subcategory: Pick<Subcategory, 'id' | 'name'> | null
}

/** 前端桌次（不含 eventId、guestIds） */
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
