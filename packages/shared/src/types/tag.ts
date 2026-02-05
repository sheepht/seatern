export type AssignedBy = 'host' | 'guest'

export interface Tag {
  id: string
  eventId: string
  name: string
}

export interface GuestTag {
  guestId: string
  tagId: string
  assignedBy: AssignedBy
}
