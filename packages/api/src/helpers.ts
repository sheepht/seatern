import { prisma } from '@seatern/db'

export function verifyEvent(eventId: string, userId: string) {
  return prisma.event.findFirst({ where: { id: eventId, userId } })
}

export function requireParam(value: string | undefined, name: string): string {
  if (!value) {
    throw new Error(`Missing required parameter: ${name}`)
  }
  return value
}
