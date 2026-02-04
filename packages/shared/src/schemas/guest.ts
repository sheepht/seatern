import { z } from 'zod'

export const sideSchema = z.enum(['groom', 'bride', 'mutual'])

export const rsvpStatusSchema = z.enum(['pending', 'confirmed', 'declined', 'modified'])

export const createGuestSchema = z.object({
  name: z.string().min(1),
  aliases: z.array(z.string()).default([]),
  side: sideSchema,
  relationScore: z.number().int().min(1).max(5),
  groupIds: z.array(z.string()).default([]),
})

export const guestFormSchema = z.object({
  rsvpStatus: z.enum(['confirmed', 'declined']),
  attendeeCount: z.number().int().min(1).max(10),
  plusOneName: z.string().optional(),
  wantToSitWith: z.array(z.string()).max(3).default([]),
  dietaryNeeds: z.array(z.string()).default([]),
  specialNeeds: z.array(z.string()).default([]),
})
