export interface Table {
  id: string
  eventId: string
  name: string
  capacity: number
  guestIds: string[]
  positionX: number
  positionY: number
  averageSatisfaction: number
  tags: string[]
  color?: string
  note?: string
}
