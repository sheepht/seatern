import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { prisma } from '@seatern/db'
import { guestFormSchema } from '@seatern/shared'

export const formRoute = new Hono()

// GET /event/:eventId — Public event info
formRoute.get('/event/:eventId', async (c) => {
  const eventId = c.req.param('eventId')
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: { id: true, name: true, date: true },
  })
  if (!event) return c.json({ error: '找不到此活動' }, 404)
  return c.json({ eventId: event.id, eventName: event.name, eventDate: event.date })
})

// GET /event/:eventId/search?q= — Search guests in event (public)
formRoute.get('/event/:eventId/search', async (c) => {
  const eventId = c.req.param('eventId')
  const q = c.req.query('q') ?? ''

  const event = await prisma.event.findUnique({ where: { id: eventId }, select: { id: true } })
  if (!event) return c.json({ error: '找不到此活動' }, 404)

  if (q.length < 1) return c.json([])

  const results = await prisma.guest.findMany({
    where: {
      eventId,
      contact: {
        OR: [
          { name: { contains: q, mode: 'insensitive' } },
          { aliases: { hasSome: [q] } },
        ],
      },
    },
    include: { contact: true },
    take: 10,
  })

  return c.json(
    results.map((g) => ({
      guestId: g.id,
      name: g.contact.name,
      aliases: g.contact.aliases,
      formToken: g.formToken,
      isSubmitted: g.rsvpStatus !== 'PENDING',
    })),
  )
})

const FORM_GUEST_INCLUDE = {
  contact: true,
  event: true,
  tags: { include: { tag: true } },
  preferencesFrom: { include: { preferred: { include: { contact: true } } }, orderBy: { rank: 'asc' as const } },
} as const

// GET /:token — Load form data
formRoute.get('/:token', async (c) => {
  const token = c.req.param('token')

  const guest = await prisma.guest.findUnique({
    where: { formToken: token },
    include: FORM_GUEST_INCLUDE,
  })

  if (!guest) return c.json({ error: '找不到此表單' }, 404)

  const isSubmitted = guest.rsvpStatus !== 'PENDING'
  const hasPending = guest.pendingSubmission != null

  return c.json({
    guestName: guest.contact.name,
    eventName: guest.event.name,
    eventDate: guest.event.date,
    eventCategories: guest.event.categories,
    rsvpStatus: guest.rsvpStatus.toLowerCase(),
    attendeeCount: guest.attendeeCount,
    infantCount: guest.infantCount,
    dietaryNote: guest.dietaryNote,
    specialNote: guest.specialNote,
    seatPreferences: guest.preferencesFrom.map((p) => ({
      preferredId: p.preferredId,
      preferredName: p.preferred.contact.name,
      rank: p.rank,
    })),
    tags: guest.tags.map((gt) => ({
      tagId: gt.tag.id,
      tagName: gt.tag.name,
      assignedBy: gt.assignedBy.toLowerCase(),
    })),
    isSubmitted,
    hasPending,
    ...(hasPending && {
      pendingSubmission: guest.pendingSubmission,
      pendingSubmittedAt: guest.pendingSubmittedAt?.toISOString(),
    }),
  })
})

// POST /:token — Submit form (saves as pending for host review)
formRoute.post('/:token', zValidator('json', guestFormSchema), async (c) => {
  const token = c.req.param('token')
  const data = c.req.valid('json')

  const guest = await prisma.guest.findUnique({
    where: { formToken: token },
    include: {
      event: { select: { id: true } },
    },
  })

  if (!guest) return c.json({ error: '找不到此表單' }, 404)

  // Resolve preferredName for each seat preference (snapshot for review display)
  const seatPrefsWithNames = await Promise.all(
    data.seatPreferences.map(async (p) => {
      const preferred = await prisma.guest.findUnique({
        where: { id: p.preferredId },
        include: { contact: { select: { name: true } } },
      })
      return {
        preferredId: p.preferredId,
        preferredName: preferred?.contact.name ?? '(未知)',
        rank: p.rank,
      }
    }),
  )

  const pendingSubmission = {
    rsvpStatus: data.rsvpStatus,
    attendeeCount: data.rsvpStatus === 'confirmed' ? data.attendeeCount : 1,
    infantCount: data.rsvpStatus === 'confirmed' ? data.infantCount : 0,
    dietaryNote: data.rsvpStatus === 'confirmed' ? data.dietaryNote : undefined,
    specialNote: data.rsvpStatus === 'confirmed' ? data.specialNote : undefined,
    seatPreferences: data.rsvpStatus === 'confirmed' ? seatPrefsWithNames : [],
    addTagIds: data.addTagIds,
    removeTagIds: data.removeTagIds,
  }

  await prisma.guest.update({
    where: { id: guest.id },
    data: {
      pendingSubmission,
      pendingSubmittedAt: new Date(),
    },
  })

  return c.json({ success: true, isPending: true })
})

// GET /:token/guests?q= — Search guests in same event (for seat preference combobox)
formRoute.get('/:token/guests', async (c) => {
  const token = c.req.param('token')
  const q = c.req.query('q') ?? ''

  const guest = await prisma.guest.findUnique({
    where: { formToken: token },
    select: { id: true, eventId: true },
  })

  if (!guest) return c.json({ error: '找不到此表單' }, 404)

  if (q.length < 1) return c.json([])

  const results = await prisma.guest.findMany({
    where: {
      eventId: guest.eventId,
      id: { not: guest.id },
      contact: {
        OR: [
          { name: { contains: q, mode: 'insensitive' } },
          { aliases: { hasSome: [q] } },
        ],
      },
    },
    include: { contact: true },
    take: 10,
  })

  return c.json(
    results.map((g) => ({
      guestId: g.id,
      name: g.contact.name,
      aliases: g.contact.aliases,
    })),
  )
})
