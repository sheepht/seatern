import { z } from 'zod'

export const createContactSchema = z.object({
  name: z.string().min(1),
  aliases: z.array(z.string()).default([]),
  email: z.string().email().optional(),
  phone: z.string().optional(),
})
