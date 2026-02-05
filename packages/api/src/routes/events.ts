import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { prisma, type EventType } from '@seatern/db'
import { createEventSchema } from '@seatern/shared'
import { guestsRoute } from './guests'
import { tagsRoute } from './tags'

type Env = { Variables: { userId: string } }

function toEventType(type: string): EventType {
  return type.toUpperCase() as EventType
}

export const eventsRoute = new Hono<Env>()

// List all events for the user
eventsRoute.get('/', async (c) => {
  const userId = c.get('userId')
  const events = await prisma.event.findMany({
    where: { userId },
    orderBy: { date: 'desc' },
  })
  return c.json(events)
})

// Create event
eventsRoute.post('/', zValidator('json', createEventSchema), async (c) => {
  const userId = c.get('userId')
  const data = c.req.valid('json')
  const event = await prisma.event.create({
    data: { ...data, date: new Date(data.date), type: toEventType(data.type), userId },
  })
  return c.json(event, 201)
})

// Get single event
eventsRoute.get('/:eventId', async (c) => {
  const userId = c.get('userId')
  const eventId = c.req.param('eventId')
  const event = await prisma.event.findFirst({
    where: { id: eventId, userId },
    include: { _count: { select: { guests: true, tables: true } } },
  })
  if (!event) return c.json({ error: 'Event not found' }, 404)
  return c.json(event)
})

// Update event
eventsRoute.put('/:eventId', zValidator('json', createEventSchema.partial()), async (c) => {
  const userId = c.get('userId')
  const eventId = c.req.param('eventId')
  const data = c.req.valid('json')

  const event = await prisma.event.findFirst({ where: { id: eventId, userId } })
  if (!event) return c.json({ error: 'Event not found' }, 404)

  const updated = await prisma.event.update({
    where: { id: eventId },
    data: {
      ...data,
      ...(data.date ? { date: new Date(data.date) } : {}),
      ...(data.type ? { type: toEventType(data.type) } : {}),
    },
  })
  return c.json(updated)
})

// Delete event
eventsRoute.delete('/:eventId', async (c) => {
  const userId = c.get('userId')
  const eventId = c.req.param('eventId')

  const event = await prisma.event.findFirst({ where: { id: eventId, userId } })
  if (!event) return c.json({ error: 'Event not found' }, 404)

  await prisma.event.delete({ where: { id: eventId } })
  return c.json({ success: true })
})

// Mount nested routes
eventsRoute.route('/:eventId/guests', guestsRoute)
eventsRoute.route('/:eventId/tags', tagsRoute)
