export type AssignedBy = 'host' | 'guest'

export interface Tag {
  id: string
  eventId: string
  name: string
  category?: string
}

export interface GuestTag {
  guestId: string
  tagId: string
  assignedBy: AssignedBy
}
