export interface TablePosition {
  row: number
  col: number
}

export interface Table {
  id: string
  eventId: string
  name: string
  capacity: number
  guestIds: string[]
  position: TablePosition
  averageSatisfaction: number
  tags: string[]
}
