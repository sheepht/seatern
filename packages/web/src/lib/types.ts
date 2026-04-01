/** 共用型別（主線程 + Web Worker 共用） */

export interface Guest {
  id: string
  name: string
  aliases: string[]
  category: string
  rsvpStatus: 'confirmed' | 'declined'
  attendeeCount: number
  dietaryNote: string
  specialNote: string
  satisfactionScore: number
  assignedTableId: string | null
  seatIndex: number | null
  isOverflow: boolean
  isIsolated: boolean
  seatPreferences: Array<{ preferredGuestId: string; rank: number }>
  guestTags: Array<{ tag: { id: string; name: string } }>
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
