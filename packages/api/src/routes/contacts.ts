import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { prisma, type Prisma } from '@seatern/db'
import { createContactSchema } from '@seatern/shared'
import type { AuthEnv } from '../middleware/auth'

export const contactsRoute = new Hono<AuthEnv>()

// List contacts (with optional ?q= search)
contactsRoute.get('/', async (c) => {
  const userId = c.get('userId')
  const q = c.req.query('q')

  const where: Prisma.ContactWhereInput = { userId }
  if (q) {
    where.OR = [
      { name: { contains: q, mode: 'insensitive' } },
      { aliases: { hasSome: [q] } },
    ]
  }

  const contacts = await prisma.contact.findMany({
    where,
    orderBy: { name: 'asc' },
  })
  return c.json(contacts)
})

// Create contact
contactsRoute.post('/', zValidator('json', createContactSchema), async (c) => {
  const userId = c.get('userId')
  const data = c.req.valid('json')
  const contact = await prisma.contact.create({
    data: { ...data, userId },
  })
  return c.json(contact, 201)
})

// Update contact
contactsRoute.put('/:contactId', zValidator('json', createContactSchema.partial()), async (c) => {
  const userId = c.get('userId')
  const contactId = c.req.param('contactId')

  const contact = await prisma.contact.findFirst({ where: { id: contactId, userId } })
  if (!contact) return c.json({ error: 'Contact not found' }, 404)

  const updated = await prisma.contact.update({
    where: { id: contactId },
    data: c.req.valid('json'),
  })
  return c.json(updated)
})

// Delete contact
contactsRoute.delete('/:contactId', async (c) => {
  const userId = c.get('userId')
  const contactId = c.req.param('contactId')

  const contact = await prisma.contact.findFirst({ where: { id: contactId, userId } })
  if (!contact) return c.json({ error: 'Contact not found' }, 404)

  await prisma.contact.delete({ where: { id: contactId } })
  return c.json({ success: true })
})
