import type { Side } from './guest'

export interface Group {
  id: string
  eventId: string
  name: string
  side: Side
  memberIds: string[]
  isCustom: boolean
}
