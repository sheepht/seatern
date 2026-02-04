import { z } from 'zod'

export const eventTypeSchema = z.enum(['wedding', 'banquet', 'corporate', 'other'])

export const createEventSchema = z.object({
  name: z.string().min(1),
  date: z.string().datetime(),
  type: eventTypeSchema.default('wedding'),
})
