import crypto from 'node:crypto'
import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { prisma } from '@seatern/db'
import { importGuestsSchema } from '@seatern/shared'
import type { AuthEnv } from '../middleware/auth'
import { requireParam, verifyEvent } from '../helpers'

export const importRoute = new Hono<AuthEnv>()

importRoute.post('/', zValidator('json', importGuestsSchema), async (c) => {
  const userId = c.get('userId')
  const eventId = requireParam(c.req.param('eventId'), 'eventId')

  const event = await verifyEvent(eventId, userId)
  if (!event) return c.json({ error: 'Event not found' }, 404)

  // Check if event has '共同' in its categories (for cross-category tag binding)
  const sharedCategory = (event.categories as string[])?.includes('共同') ? '共同' : null

  const rows = c.req.valid('json')
  const errors: { row: number; message: string }[] = []
  let created = 0

  // Process in a transaction
  await prisma.$transaction(async (tx) => {
    // 收集所有匯入的 category，結束後自動加入 event.categories
    const importedCategories = new Set<string>()

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]
      try {
        if (row.category) importedCategories.add(row.category)
        // Create or find contact
        const aliases = row.aliases
          ? row.aliases.split(/[,，]/).map((s) => s.trim()).filter(Boolean)
          : []

        const contact = await tx.contact.create({
          data: {
            name: row.name,
            aliases,
            userId,
          },
        })

        // Resolve tag IDs
        const tagIds: string[] = []
        if (row.tagNames && row.tagNames.length > 0) {
          const guestCategory = row.category || null
          for (const tagName of row.tagNames) {
            let tag = await tx.tag.findFirst({ where: { eventId, name: tagName } })
            if (!tag) {
              // New tag: bind to guest's category
              tag = await tx.tag.create({ data: { eventId, name: tagName, category: guestCategory } })
            } else if (tag.category && tag.category !== guestCategory && tag.category !== sharedCategory) {
              // Existing tag used by a different category: set to '共同' or clear
              tag = await tx.tag.update({ where: { id: tag.id }, data: { category: sharedCategory } })
            }
            tagIds.push(tag.id)
          }
        }

        // Create guest
        await tx.guest.create({
          data: {
            eventId,
            contactId: contact.id,
            formToken: crypto.randomUUID(),
            category: row.category || null,
            relationScore: row.relationScore,
            ...(row.attendeeCount && { attendeeCount: row.attendeeCount }),
            ...(row.infantCount && { infantCount: row.infantCount }),
            ...(row.dietaryNote && { dietaryNote: row.dietaryNote }),
            ...(tagIds.length > 0 && {
              tags: { create: tagIds.map((tagId) => ({ tagId, assignedBy: 'HOST' as const })) },
            }),
          },
        })

        created++
      } catch (err: any) {
        errors.push({ row: i + 1, message: err.message ?? 'Unknown error' })
      }
    }

    // 把匯入中出現的新 category 加到 event.categories
    const existingCategories = new Set((event.categories as string[]) ?? [])
    const newCategories = [...importedCategories].filter((c) => !existingCategories.has(c))
    if (newCategories.length > 0) {
      await tx.event.update({
        where: { id: eventId },
        data: { categories: [...existingCategories, ...newCategories] },
      })
    }
  })

  return c.json({ created, errors })
})
