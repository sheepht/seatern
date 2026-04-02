import type { RawGuest } from './column-detector'

interface ExistingGuest {
  name: string
  aliases: string[]
}

export interface DiffResult {
  newGuests: RawGuest[]
  skippedGuests: RawGuest[]
}

/**
 * 比對匯入的賓客與現有賓客，找出新賓客
 *
 * 比對邏輯：精確比對（trim + lowercase），同時比對現有賓客的 name 和 aliases
 */
export function diffGuests(
  imported: RawGuest[],
  existing: ExistingGuest[],
): DiffResult {
  // 建立現有名稱的 lookup set（含別名）
  const existingNames = new Set<string>()
  for (const g of existing) {
    existingNames.add(g.name.trim().toLowerCase())
    for (const alias of g.aliases) {
      if (alias) existingNames.add(alias.trim().toLowerCase())
    }
  }

  const newGuests: RawGuest[] = []
  const skippedGuests: RawGuest[] = []

  for (const guest of imported) {
    const normalizedName = guest.name.trim().toLowerCase()
    if (existingNames.has(normalizedName)) {
      skippedGuests.push(guest)
    } else {
      newGuests.push(guest)
    }
  }

  return { newGuests, skippedGuests }
}
