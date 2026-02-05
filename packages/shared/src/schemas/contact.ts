import { z } from 'zod'

export const createContactSchema = z.object({
  name: z.string().min(1),
  aliases: z.array(z.string()).default([]),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  dietaryNeeds: z.array(z.string()).default([]),
  specialNeeds: z.array(z.string()).default([]),
  tags: z.array(z.string()).default([]),
})
