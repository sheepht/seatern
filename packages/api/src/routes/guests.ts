import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { prisma } from '@seatern/db'
import { createGuestSchema, guestTagUpdateSchema } from '@seatern/shared'

type Env = { Variables: { userId: string } }

export const guestsRoute = new Hono<Env>()

// Helper: verify event belongs to user
async function verifyEvent(eventId: string, userId: string) {
  return prisma.event.findFirst({ where: { id: eventId, userId } })
}

// List guests for an event
guestsRoute.get('/', async (c) => {
  const userId = c.get('userId')
  const eventId = c.req.param('eventId')

  const event = await verifyEvent(eventId, userId)
  if (!event) return c.json({ error: 'Event not found' }, 404)

  const guests = await prisma.guest.findMany({
    where: { eventId },
    include: {
      contact: true,
      tags: { include: { tag: true } },
    },
    orderBy: { createdAt: 'asc' },
  })
  return c.json(guests)
})

// Create guest
guestsRoute.post('/', zValidator('json', createGuestSchema), async (c) => {
  const userId = c.get('userId')
  const eventId = c.req.param('eventId')

  const event = await verifyEvent(eventId, userId)
  if (!event) return c.json({ error: 'Event not found' }, 404)

  const { tagIds, ...guestData } = c.req.valid('json')

  const guest = await prisma.guest.create({
    data: {
      ...guestData,
      eventId,
      tags: tagIds.length > 0
        ? { create: tagIds.map((tagId) => ({ tagId, assignedBy: 'HOST' as const })) }
        : undefined,
    },
    include: {
      contact: true,
      tags: { include: { tag: true } },
    },
  })
  return c.json(guest, 201)
})

// Update guest
guestsRoute.put('/:guestId', zValidator('json', createGuestSchema.partial()), async (c) => {
  const userId = c.get('userId')
  const eventId = c.req.param('eventId')
  const guestId = c.req.param('guestId')

  const event = await verifyEvent(eventId, userId)
  if (!event) return c.json({ error: 'Event not found' }, 404)

  const guest = await prisma.guest.findFirst({ where: { id: guestId, eventId } })
  if (!guest) return c.json({ error: 'Guest not found' }, 404)

  const { tagIds, ...guestData } = c.req.valid('json')

  const updated = await prisma.guest.update({
    where: { id: guestId },
    data: guestData,
    include: {
      contact: true,
      tags: { include: { tag: true } },
    },
  })
  return c.json(updated)
})

// Delete guest
guestsRoute.delete('/:guestId', async (c) => {
  const userId = c.get('userId')
  const eventId = c.req.param('eventId')
  const guestId = c.req.param('guestId')

  const event = await verifyEvent(eventId, userId)
  if (!event) return c.json({ error: 'Event not found' }, 404)

  const guest = await prisma.guest.findFirst({ where: { id: guestId, eventId } })
  if (!guest) return c.json({ error: 'Guest not found' }, 404)

  await prisma.guest.delete({ where: { id: guestId } })
  return c.json({ success: true })
})

// Update guest tags
guestsRoute.post('/:guestId/tags', zValidator('json', guestTagUpdateSchema), async (c) => {
  const userId = c.get('userId')
  const eventId = c.req.param('eventId')
  const guestId = c.req.param('guestId')

  const event = await verifyEvent(eventId, userId)
  if (!event) return c.json({ error: 'Event not found' }, 404)

  const guest = await prisma.guest.findFirst({ where: { id: guestId, eventId } })
  if (!guest) return c.json({ error: 'Guest not found' }, 404)

  const { addTagIds, removeTagIds } = c.req.valid('json')

  await prisma.$transaction([
    ...(removeTagIds.length > 0
      ? [prisma.guestTag.deleteMany({ where: { guestId, tagId: { in: removeTagIds } } })]
      : []),
    ...(addTagIds.length > 0
      ? [prisma.guestTag.createMany({
          data: addTagIds.map((tagId) => ({ guestId, tagId, assignedBy: 'HOST' as const })),
          skipDuplicates: true,
        })]
      : []),
  ])

  const updated = await prisma.guest.findUnique({
    where: { id: guestId },
    include: {
      contact: true,
      tags: { include: { tag: true } },
    },
  })
  return c.json(updated)
})
