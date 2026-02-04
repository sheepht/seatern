import { z } from 'zod'

export const createTableSchema = z.object({
  name: z.string().min(1),
  capacity: z.number().int().min(1).max(20).default(10),
  positionRow: z.number().int().default(0),
  positionCol: z.number().int().default(0),
  tags: z.array(z.string()).default([]),
})
