export type RsvpStatus = 'confirmed' | 'declined'

export interface PendingSubmission {
  rsvpStatus: 'confirmed' | 'declined'
  attendeeCount: number
  infantCount: number
  dietaryNote?: string
  specialNote?: string
  seatPreferences: Array<{ preferredId: string; preferredName: string; rank: number }>
}

export interface Guest {
  id: string
  eventId: string
  contactId: string
  category?: string
  subcategoryId?: string
  rsvpStatus: RsvpStatus
  attendeeCount: number
  infantCount: number
  dietaryNote?: string
  specialNote?: string
  satisfactionScore: number
  assignedTableId?: string
  isOverflow: boolean
  isIsolated: boolean
  pendingSubmission?: PendingSubmission | null
  pendingSubmittedAt?: string | null
  createdAt: string
  updatedAt: string
}
