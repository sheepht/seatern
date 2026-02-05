import { z } from 'zod'

export const createTableSchema = z.object({
  name: z.string().min(1),
  capacity: z.number().int().min(1).max(20).default(10),
  positionX: z.number().default(0),
  positionY: z.number().default(0),
  tags: z.array(z.string()).default([]),
  color: z.string().optional(),
  note: z.string().optional(),
})
