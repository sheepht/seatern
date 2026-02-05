import { z } from 'zod'

export const rsvpStatusSchema = z.enum(['pending', 'confirmed', 'declined', 'modified'])

export const createGuestSchema = z.object({
  contactId: z.string().min(1),
  category: z.string().optional(),
  relationScore: z.number().int().min(1).max(5),
  tagIds: z.array(z.string()).default([]),
})

export const guestFormSchema = z.object({
  rsvpStatus: z.enum(['confirmed', 'declined']),
  attendeeCount: z.number().int().min(1).max(10),
  infantCount: z.number().int().min(0).max(5).default(0),
  seatPreferences: z.array(z.object({
    preferredId: z.string(),
    rank: z.number().int().min(1).max(3),
  })).max(3).default([]),
  dietaryNote: z.string().optional(),
  specialNote: z.string().optional(),
  addTagIds: z.array(z.string()).default([]),
  removeTagIds: z.array(z.string()).default([]),
})
