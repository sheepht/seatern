import crypto from 'node:crypto'
import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { prisma } from '@seatern/db'
import { createGuestSchema, guestTagUpdateSchema } from '@seatern/shared'
import type { AuthEnv } from '../middleware/auth'
import { requireParam, verifyEvent } from '../helpers'
import { importRoute } from './import'

const GUEST_INCLUDE = {
  contact: true,
  tags: { include: { tag: true } },
} as const

export const guestsRoute = new Hono<AuthEnv>()

// List guests for an event
guestsRoute.get('/', async (c) => {
  const userId = c.get('userId')
  const eventId = requireParam(c.req.param('eventId'), 'eventId')

  const event = await verifyEvent(eventId, userId)
  if (!event) return c.json({ error: 'Event not found' }, 404)

  const guests = await prisma.guest.findMany({
    where: { eventId },
    include: GUEST_INCLUDE,
    orderBy: { createdAt: 'asc' },
  })
  return c.json(guests)
})

// Create guest
guestsRoute.post('/', zValidator('json', createGuestSchema), async (c) => {
  const userId = c.get('userId')
  const eventId = requireParam(c.req.param('eventId'), 'eventId')

  const event = await verifyEvent(eventId, userId)
  if (!event) return c.json({ error: 'Event not found' }, 404)

  const { tagIds, ...guestData } = c.req.valid('json')

  const guest = await prisma.guest.create({
    data: {
      ...guestData,
      eventId,
      formToken: crypto.randomUUID(),
      ...(tagIds.length > 0 && {
        tags: { create: tagIds.map((tagId) => ({ tagId, assignedBy: 'HOST' as const })) },
      }),
    },
    include: GUEST_INCLUDE,
  })
  return c.json(guest, 201)
})

// Update guest
guestsRoute.put('/:guestId', zValidator('json', createGuestSchema.partial()), async (c) => {
  const userId = c.get('userId')
  const eventId = requireParam(c.req.param('eventId'), 'eventId')
  const guestId = requireParam(c.req.param('guestId'), 'guestId')

  const event = await verifyEvent(eventId, userId)
  if (!event) return c.json({ error: 'Event not found' }, 404)

  const guest = await prisma.guest.findFirst({ where: { id: guestId, eventId } })
  if (!guest) return c.json({ error: 'Guest not found' }, 404)

  const { tagIds: _tagIds, ...guestData } = c.req.valid('json')

  const updated = await prisma.guest.update({
    where: { id: guestId },
    data: guestData,
    include: GUEST_INCLUDE,
  })
  return c.json(updated)
})

// Delete guest
guestsRoute.delete('/:guestId', async (c) => {
  const userId = c.get('userId')
  const eventId = requireParam(c.req.param('eventId'), 'eventId')
  const guestId = requireParam(c.req.param('guestId'), 'guestId')

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
  const eventId = requireParam(c.req.param('eventId'), 'eventId')
  const guestId = requireParam(c.req.param('guestId'), 'guestId')

  const event = await verifyEvent(eventId, userId)
  if (!event) return c.json({ error: 'Event not found' }, 404)

  const guest = await prisma.guest.findFirst({ where: { id: guestId, eventId } })
  if (!guest) return c.json({ error: 'Guest not found' }, 404)

  const { addTagIds, removeTagIds } = c.req.valid('json')

  const operations = []
  if (removeTagIds.length > 0) {
    operations.push(prisma.guestTag.deleteMany({ where: { guestId, tagId: { in: removeTagIds } } }))
  }
  if (addTagIds.length > 0) {
    operations.push(prisma.guestTag.createMany({
      data: addTagIds.map((tagId) => ({ guestId, tagId, assignedBy: 'HOST' as const })),
      skipDuplicates: true,
    }))
  }
  if (operations.length > 0) {
    await prisma.$transaction(operations)
  }

  const updated = await prisma.guest.findUnique({
    where: { id: guestId },
    include: GUEST_INCLUDE,
  })
  return c.json(updated)
})

// Mount import sub-route
guestsRoute.route('/import', importRoute)
