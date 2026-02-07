import type { PrismaClient } from '@prisma/client'
import { computeSatisfaction, chunk } from './helpers.js'

export interface GuestRecord {
  id: string
  contactId: string
  category: string | null
  tagIds: string[]
  assignedTableId: string | null
}

/** Compute and persist satisfaction scores for all guests, update table averages, and mark isolated guests. */
export async function computeAndUpdateSatisfaction(
  prisma: PrismaClient,
  eventId: string,
  guestRecords: Array<{ id: string; tagIds: string[] }>,
  tableAssignment: Map<string, string[]>,
  preferenceMap: Map<string, string[]>,
  tables: Array<{ id: string }>,
): void {
  const guestToTable = new Map<string, string>()
  for (const [tableId, guestIds] of tableAssignment) {
    for (const gid of guestIds) {
      guestToTable.set(gid, tableId)
    }
  }

  const tableGuestSets = new Map<string, Set<string>>()
  for (const [tableId, guestIds] of tableAssignment) {
    tableGuestSets.set(tableId, new Set(guestIds))
  }

  const guestTags = new Map<string, Set<string>>()
  for (const g of guestRecords) {
    guestTags.set(g.id, new Set(g.tagIds))
  }

  const dbTables = await prisma.table.findMany({
    where: { eventId },
    select: { id: true, positionX: true, positionY: true },
  })
  const tablePositions = new Map(
    dbTables.map((t) => [t.id, { x: t.positionX, y: t.positionY }]),
  )

  function getAdjacentTableIds(tableId: string): string[] {
    const pos = tablePositions.get(tableId)
    if (!pos) return []
    return dbTables
      .filter((t) => t.id !== tableId)
      .map((t) => ({
        id: t.id,
        dist: Math.sqrt((t.positionX - pos.x) ** 2 + (t.positionY - pos.y) ** 2),
      }))
      .sort((a, b) => a.dist - b.dist)
      .slice(0, 2)
      .map((d) => d.id)
  }

  const updates: Array<{ id: string; score: number }> = []

  for (const guest of guestRecords) {
    const tableId = guestToTable.get(guest.id)
    if (!tableId) {
      updates.push({ id: guest.id, score: 55 })
      continue
    }

    const sameTableGuests = tableGuestSets.get(tableId) || new Set()
    const myTags = guestTags.get(guest.id) || new Set()

    let sameTagCount = 0
    for (const otherId of sameTableGuests) {
      if (otherId === guest.id) continue
      const otherTags = guestTags.get(otherId) || new Set()
      for (const t of myTags) {
        if (otherTags.has(t)) {
          sameTagCount++
          break
        }
      }
    }
    const tableSize = sameTableGuests.size - 1
    const sameTagRatio = tableSize > 0 ? sameTagCount / tableSize : 0

    const prefs = preferenceMap.get(guest.id) || []
    let preferenceMatches = 0
    let preferenceNearby = false
    const adjacentTables = getAdjacentTableIds(tableId)
    const adjacentGuests = new Set<string>()
    for (const adjId of adjacentTables) {
      const adjSet = tableGuestSets.get(adjId)
      if (adjSet) {
        for (const gid of adjSet) adjacentGuests.add(gid)
      }
    }

    for (const prefId of prefs) {
      if (sameTableGuests.has(prefId)) {
        preferenceMatches++
      } else if (adjacentGuests.has(prefId)) {
        preferenceNearby = true
      }
    }

    const score = computeSatisfaction({
      sameTagRatio,
      preferenceMatches,
      totalPreferences: prefs.length,
      preferenceNearby,
    })

    updates.push({ id: guest.id, score })
  }

  // Batch update satisfaction scores
  for (const batch of chunk(updates, 50)) {
    await prisma.$transaction(
      batch.map((u) =>
        prisma.guest.update({
          where: { id: u.id },
          data: { satisfactionScore: u.score },
        }),
      ),
    )
  }

  // Update table average satisfaction
  for (const table of tables) {
    const guestIds = tableAssignment.get(table.id) || []
    if (guestIds.length === 0) continue
    const scores = updates.filter((u) => guestIds.includes(u.id)).map((u) => u.score)
    const avg = scores.reduce((a, b) => a + b, 0) / scores.length
    await prisma.table.update({
      where: { id: table.id },
      data: { averageSatisfaction: Math.round(avg * 10) / 10 },
    })
  }

  // Mark isolated guests
  const isolated = guestRecords.filter((g) => {
    const prefs = preferenceMap.get(g.id)
    const hasPrefs = prefs && prefs.length > 0
    const isPreferredBySomeone = [...preferenceMap.values()].some((pids) =>
      pids.includes(g.id),
    )
    return !hasPrefs && !isPreferredBySomeone && g.tagIds.length === 0
  })

  if (isolated.length > 0) {
    await prisma.guest.updateMany({
      where: { id: { in: isolated.map((g) => g.id) } },
      data: { isIsolated: true },
    })
    console.log(`  Marked ${isolated.length} guests as isolated`)
  }

  const avgScore = updates.reduce((a, b) => a + b.score, 0) / updates.length
  console.log(`  Average satisfaction: ${avgScore.toFixed(1)}`)
}

/** Build guestTag associations and return the tagGuestMap and guestTagData for bulk insert. */
export function buildGuestTagAssociations(
  guestRecords: GuestRecord[],
  tags: Array<{ id: string }>,
  tagAssignments: Map<string, string[]>,
): {
  guestTagData: Array<{ guestId: string; tagId: string }>
  tagGuestMap: Record<string, string[]>
} {
  const guestTagData: Array<{ guestId: string; tagId: string }> = []
  const tagGuestMap: Record<string, string[]> = {}
  const contactToGuest = new Map(guestRecords.map((g) => [g.contactId, g.id]))

  for (const tag of tags) {
    tagGuestMap[tag.id] = []
    const contactIds = tagAssignments.get(tag.id) || []
    for (const contactId of contactIds) {
      const guestId = contactToGuest.get(contactId)
      if (guestId) {
        guestTagData.push({ guestId, tagId: tag.id })
        tagGuestMap[tag.id].push(guestId)
        const gr = guestRecords.find((g) => g.id === guestId)
        if (gr) gr.tagIds.push(tag.id)
      }
    }
  }

  return { guestTagData, tagGuestMap }
}

/** Build guestInfos with assignedTableId populated from tableAssignment. */
export function buildGuestInfos(
  guestRecords: GuestRecord[],
  tableAssignment: Map<string, string[]>,
): Array<{ id: string; tagIds: string[]; assignedTableId: string | null }> {
  const guestInfos = guestRecords.map((g) => ({
    id: g.id,
    tagIds: g.tagIds,
    assignedTableId: null as string | null,
  }))
  for (const [tableId, guestIds] of tableAssignment) {
    for (const gid of guestIds) {
      const gi = guestInfos.find((g) => g.id === gid)
      if (gi) gi.assignedTableId = tableId
    }
  }
  return guestInfos
}

/** Assign contacts to tags using a multi-tag strategy (each contact can have up to maxTagsPerContact tags). */
export function assignContactsToTagsMulti(
  contacts: Array<{ id: string }>,
  tags: Array<{ id: string }>,
  tagEstimatedCounts: number[],
  maxTagsPerContact = 2,
): Map<string, string[]> {
  const result = new Map<string, string[]>()
  const usedCounts = new Map<string, number>()

  for (const tag of tags) {
    result.set(tag.id, [])
  }

  for (let i = 0; i < tags.length; i++) {
    const tag = tags[i]
    const count = tagEstimatedCounts[i]

    const available = contacts
      .filter((c) => (usedCounts.get(c.id) || 0) < maxTagsPerContact)
      .sort(() => Math.random() - 0.5)

    const selected = available.slice(0, Math.min(count, available.length))
    for (const c of selected) {
      result.get(tag.id)!.push(c.id)
      usedCounts.set(c.id, (usedCounts.get(c.id) || 0) + 1)
    }
  }

  return result
}
