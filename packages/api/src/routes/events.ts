import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { prisma, type EventType } from '@seatern/db'
import { createEventSchema } from '@seatern/shared'
import type { AuthEnv } from '../middleware/auth'
import { guestsRoute } from './guests'
import { tagsRoute } from './tags'

const renameCategorySchema = z.object({
  oldName: z.string().min(1),
  newName: z.string().min(1),
})

function toEventType(type: string): EventType {
  return type.toUpperCase() as EventType
}

async function findOwnedEvent(userId: string, eventId: string) {
  return prisma.event.findFirst({ where: { id: eventId, userId } })
}

export const eventsRoute = new Hono<AuthEnv>()

// List all events for the user
eventsRoute.get('/', async (c) => {
  const userId = c.get('userId')
  const events = await prisma.event.findMany({
    where: { userId },
    include: { _count: { select: { guests: true, tables: true } } },
    orderBy: { date: 'desc' },
  })
  return c.json(events)
})

// Create event
eventsRoute.post('/', zValidator('json', createEventSchema), async (c) => {
  const userId = c.get('userId')
  const data = c.req.valid('json')
  const event = await prisma.event.create({
    data: {
      ...data,
      date: new Date(data.date),
      type: toEventType(data.type),
      userId,
    },
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
  const { date, type, ...rest } = c.req.valid('json')

  const event = await findOwnedEvent(userId, eventId)
  if (!event) return c.json({ error: 'Event not found' }, 404)

  const updated = await prisma.event.update({
    where: { id: eventId },
    data: {
      ...rest,
      ...(date !== undefined && { date: new Date(date) }),
      ...(type !== undefined && { type: toEventType(type) }),
    },
  })
  return c.json(updated)
})

// Delete event
eventsRoute.delete('/:eventId', async (c) => {
  const userId = c.get('userId')
  const eventId = c.req.param('eventId')

  const event = await findOwnedEvent(userId, eventId)
  if (!event) return c.json({ error: 'Event not found' }, 404)

  await prisma.event.delete({ where: { id: eventId } })
  return c.json({ success: true })
})

// Delete category (atomic: event.categories + guest.category + tag.category)
const deleteCategorySchema = z.object({ name: z.string().min(1) })

eventsRoute.post('/:eventId/delete-category', zValidator('json', deleteCategorySchema), async (c) => {
  const userId = c.get('userId')
  const eventId = c.req.param('eventId')
  const { name } = c.req.valid('json')

  const event = await findOwnedEvent(userId, eventId)
  if (!event) return c.json({ error: 'Event not found' }, 404)

  await prisma.$transaction([
    prisma.event.update({
      where: { id: eventId },
      data: { categories: event.categories.filter((cat) => cat !== name) },
    }),
    prisma.guest.updateMany({
      where: { eventId, category: name },
      data: { category: null },
    }),
    prisma.tag.updateMany({
      where: { eventId, category: name },
      data: { category: null },
    }),
  ])

  return c.json({ success: true })
})

// Rename category (atomic: event.categories + guest.category + tag.category)
eventsRoute.post('/:eventId/rename-category', zValidator('json', renameCategorySchema), async (c) => {
  const userId = c.get('userId')
  const eventId = c.req.param('eventId')
  const { oldName, newName } = c.req.valid('json')

  const event = await findOwnedEvent(userId, eventId)
  if (!event) return c.json({ error: 'Event not found' }, 404)

  const updatedCategories = event.categories.map((cat) => (cat === oldName ? newName : cat))

  await prisma.$transaction([
    prisma.event.update({
      where: { id: eventId },
      data: { categories: updatedCategories },
    }),
    prisma.guest.updateMany({
      where: { eventId, category: oldName },
      data: { category: newName },
    }),
    prisma.tag.updateMany({
      where: { eventId, category: oldName },
      data: { category: newName },
    }),
  ])

  return c.json({ success: true })
})

// Mount nested routes
eventsRoute.route('/:eventId/guests', guestsRoute)
eventsRoute.route('/:eventId/tags', tagsRoute)
