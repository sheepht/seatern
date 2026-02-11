import crypto from 'node:crypto'
import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { prisma, Prisma } from '@seatern/db'
import { createGuestSchema, guestTagUpdateSchema } from '@seatern/shared'
import type { AuthEnv } from '../middleware/auth'
import { requireParam, verifyEvent } from '../helpers'
import { importRoute } from './import'

const GUEST_INCLUDE = {
  contact: true,
  tags: { include: { tag: true } },
  preferencesFrom: { include: { preferred: { include: { contact: true } } }, orderBy: { rank: 'asc' as const } },
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

// Approve pending submission
guestsRoute.post('/:guestId/approve', async (c) => {
  const userId = c.get('userId')
  const eventId = requireParam(c.req.param('eventId'), 'eventId')
  const guestId = requireParam(c.req.param('guestId'), 'guestId')

  const event = await verifyEvent(eventId, userId)
  if (!event) return c.json({ error: 'Event not found' }, 404)

  const guest = await prisma.guest.findFirst({
    where: { id: guestId, eventId },
    include: GUEST_INCLUDE,
  })
  if (!guest) return c.json({ error: 'Guest not found' }, 404)
  if (!guest.pendingSubmission) return c.json({ error: 'No pending submission' }, 400)

  const pending = guest.pendingSubmission as {
    rsvpStatus: string
    attendeeCount: number
    infantCount: number
    dietaryNote?: string
    specialNote?: string
    seatPreferences: Array<{ preferredId: string; preferredName: string; rank: number }>
    addTagIds: string[]
    removeTagIds: string[]
  }

  // Determine RSVP status
  let rsvpStatus: 'CONFIRMED' | 'DECLINED' | 'MODIFIED'
  if (pending.rsvpStatus === 'declined') {
    rsvpStatus = 'DECLINED'
  } else if (guest.rsvpStatus === 'PENDING') {
    rsvpStatus = 'CONFIRMED'
  } else {
    rsvpStatus = 'MODIFIED'
  }

  const updated = await prisma.$transaction(async (tx) => {
    // 1. Update guest fields + clear pending
    const updatedGuest = await tx.guest.update({
      where: { id: guestId },
      data: {
        rsvpStatus,
        attendeeCount: pending.rsvpStatus === 'confirmed' ? pending.attendeeCount : 0,
        infantCount: pending.rsvpStatus === 'confirmed' ? pending.infantCount : 0,
        dietaryNote: pending.rsvpStatus === 'confirmed' ? (pending.dietaryNote ?? null) : null,
        specialNote: pending.rsvpStatus === 'confirmed' ? (pending.specialNote ?? null) : null,
        pendingSubmission: Prisma.DbNull,
        pendingSubmittedAt: null,
      },
      include: GUEST_INCLUDE,
    })

    // 2. Delete old seat preferences + create new ones
    await tx.seatPreference.deleteMany({ where: { guestId } })
    if (pending.rsvpStatus === 'confirmed' && pending.seatPreferences.length > 0) {
      // Filter out invalid preferredIds (deleted guests)
      const validIds = await tx.guest.findMany({
        where: { id: { in: pending.seatPreferences.map((p) => p.preferredId) }, eventId },
        select: { id: true },
      })
      const validIdSet = new Set(validIds.map((g) => g.id))
      const validPrefs = pending.seatPreferences.filter((p) => validIdSet.has(p.preferredId))

      if (validPrefs.length > 0) {
        await tx.seatPreference.createMany({
          data: validPrefs.map((p) => ({
            guestId,
            preferredId: p.preferredId,
            rank: p.rank,
          })),
        })
      }
    }

    // 3. Handle tag changes (assignedBy: GUEST)
    if (pending.removeTagIds.length > 0) {
      await tx.guestTag.deleteMany({
        where: { guestId, tagId: { in: pending.removeTagIds }, assignedBy: 'GUEST' },
      })
    }
    if (pending.addTagIds.length > 0) {
      await tx.guestTag.createMany({
        data: pending.addTagIds.map((tagId) => ({ guestId, tagId, assignedBy: 'GUEST' as const })),
        skipDuplicates: true,
      })
    }

    return updatedGuest
  })

  return c.json(updated)
})

// Reject pending submission (silent — guest is not notified)
guestsRoute.post('/:guestId/reject', async (c) => {
  const userId = c.get('userId')
  const eventId = requireParam(c.req.param('eventId'), 'eventId')
  const guestId = requireParam(c.req.param('guestId'), 'guestId')

  const event = await verifyEvent(eventId, userId)
  if (!event) return c.json({ error: 'Event not found' }, 404)

  const guest = await prisma.guest.findFirst({ where: { id: guestId, eventId } })
  if (!guest) return c.json({ error: 'Guest not found' }, 404)

  const updated = await prisma.guest.update({
    where: { id: guestId },
    data: {
      pendingSubmission: Prisma.DbNull,
      pendingSubmittedAt: null,
    },
    include: GUEST_INCLUDE,
  })

  return c.json(updated)
})

// Mount import sub-route
guestsRoute.route('/import', importRoute)
