export type EventType = 'wedding' | 'banquet' | 'corporate' | 'other'

export interface Event {
  id: string
  userId: string
  name: string
  date: string
  type: EventType
  createdAt: string
  updatedAt: string
}
