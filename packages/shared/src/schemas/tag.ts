import { z } from 'zod'

export const createTagSchema = z.object({
  name: z.string().min(1).max(50),
  category: z.string().optional(),
})

export const guestTagUpdateSchema = z.object({
  addTagIds: z.array(z.string()).default([]),
  removeTagIds: z.array(z.string()).default([]),
})
