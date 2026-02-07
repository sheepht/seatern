import { z } from 'zod'

export const importGuestRowSchema = z.object({
  name: z.string().min(1),
  aliases: z.string().optional(),
  category: z.string().optional(),
  relationScore: z.number().int().min(1).max(3),
  attendeeCount: z.number().int().min(1).max(2).optional(),
  infantCount: z.number().int().min(0).max(5).optional(),
  dietaryNote: z.string().optional(),
  tagNames: z.array(z.string()).optional(),
})

export const importGuestsSchema = z.array(importGuestRowSchema).min(1).max(500)
