import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { prisma } from '@seatern/db'
import { createTagSchema } from '@seatern/shared'
import type { AuthEnv } from '../middleware/auth'
import { requireParam, verifyEvent } from '../helpers'

export const tagsRoute = new Hono<AuthEnv>()

// List tags for an event
tagsRoute.get('/', async (c) => {
  const userId = c.get('userId')
  const eventId = requireParam(c.req.param('eventId'), 'eventId')

  const event = await verifyEvent(eventId, userId)
  if (!event) return c.json({ error: 'Event not found' }, 404)

  const tags = await prisma.tag.findMany({
    where: { eventId },
    include: { _count: { select: { guests: true } } },
    orderBy: { name: 'asc' },
  })
  return c.json(tags)
})

// Create tag
tagsRoute.post('/', zValidator('json', createTagSchema), async (c) => {
  const userId = c.get('userId')
  const eventId = requireParam(c.req.param('eventId'), 'eventId')

  const event = await verifyEvent(eventId, userId)
  if (!event) return c.json({ error: 'Event not found' }, 404)

  const data = c.req.valid('json')
  const tag = await prisma.tag.create({
    data: { ...data, eventId },
  })
  return c.json(tag, 201)
})

// Update tag
tagsRoute.put('/:tagId', zValidator('json', createTagSchema.partial()), async (c) => {
  const userId = c.get('userId')
  const eventId = requireParam(c.req.param('eventId'), 'eventId')
  const tagId = requireParam(c.req.param('tagId'), 'tagId')

  const event = await verifyEvent(eventId, userId)
  if (!event) return c.json({ error: 'Event not found' }, 404)

  const tag = await prisma.tag.findFirst({ where: { id: tagId, eventId } })
  if (!tag) return c.json({ error: 'Tag not found' }, 404)

  const updated = await prisma.tag.update({
    where: { id: tagId },
    data: c.req.valid('json'),
  })
  return c.json(updated)
})

// Delete tag
tagsRoute.delete('/:tagId', async (c) => {
  const userId = c.get('userId')
  const eventId = requireParam(c.req.param('eventId'), 'eventId')
  const tagId = requireParam(c.req.param('tagId'), 'tagId')

  const event = await verifyEvent(eventId, userId)
  if (!event) return c.json({ error: 'Event not found' }, 404)

  const tag = await prisma.tag.findFirst({ where: { id: tagId, eventId } })
  if (!tag) return c.json({ error: 'Tag not found' }, 404)

  await prisma.tag.delete({ where: { id: tagId } })
  return c.json({ success: true })
})
