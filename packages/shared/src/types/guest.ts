export type RsvpStatus = 'pending' | 'confirmed' | 'declined' | 'modified'

export interface Guest {
  id: string
  eventId: string
  contactId: string
  category?: string
  relationScore: number
  tagIds: string[]
  rsvpStatus: RsvpStatus
  attendeeCount: number
  infantCount: number
  dietaryNeeds?: string[]
  specialNeeds?: string[]
  needsMet: boolean
  satisfactionScore: number
  assignedTableId?: string
  isOverflow: boolean
  isIsolated: boolean
  createdAt: string
  updatedAt: string
}
