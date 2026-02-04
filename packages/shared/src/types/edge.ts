export type EdgeType = 'mutual' | 'one-way' | 'same-group' | 'inferred'

export interface Edge {
  id: string
  eventId: string
  fromGuestId: string
  toGuestId: string
  weight: number
  type: EdgeType
}
