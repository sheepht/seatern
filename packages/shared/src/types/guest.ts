export type Side = 'groom' | 'bride' | 'mutual'

export type RsvpStatus = 'pending' | 'confirmed' | 'declined' | 'modified'

export interface Guest {
  id: string
  eventId: string
  contactId: string
  side?: Side
  relationScore: number
  tagIds: string[]
  rsvpStatus: RsvpStatus
  attendeeCount: number
  plusOneName?: string
  dietaryNeeds?: string[]
  specialNeeds?: string[]
  satisfactionScore: number
  assignedTableId?: string
  isOverflow: boolean
  isIsolated: boolean
  createdAt: string
  updatedAt: string
}
