export interface Contact {
  id: string
  userId: string
  name: string
  aliases: string[]
  email?: string
  phone?: string
  dietaryNeeds: string[]
  specialNeeds: string[]
  tags: string[]
  createdAt: string
  updatedAt: string
}
