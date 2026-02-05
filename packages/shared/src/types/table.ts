export interface Table {
  id: string
  eventId: string
  name: string
  capacity: number
  guestIds: string[]
  positionX: number
  positionY: number
  averageSatisfaction: number
  color?: string
  note?: string
}
