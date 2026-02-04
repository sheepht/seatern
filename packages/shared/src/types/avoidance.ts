export type AvoidanceReason = 'ex' | 'family-conflict' | 'work-conflict' | 'other'

export interface Avoidance {
  id: string
  eventId: string
  guestId1: string
  guestId2: string
  reason?: AvoidanceReason
  note?: string
}
