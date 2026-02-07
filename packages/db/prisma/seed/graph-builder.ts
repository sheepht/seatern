import type { PrismaClient } from '@prisma/client'
import { faker } from './helpers.js'

interface GuestInfo {
  id: string
  tagIds: string[]
  assignedTableId: string | null
}

interface TagGuestMap {
  [tagId: string]: string[] // tagId -> guestIds
}

/**
 * 建立社交圖（Edges + SeatPreferences）
 * 回傳 preferenceMap 供後續滿意度計算
 */
export async function buildSocialGraph(
  prisma: PrismaClient,
  eventId: string,
  guests: GuestInfo[],
  tagGuestMap: TagGuestMap,
  confirmedGuestIds?: Set<string>,
): Promise<Map<string, string[]>> {
  const guestSet = new Set(guests.map(g => g.id))

  // 1. SAME_GROUP edges：同 tag guests 之間建邊
  console.log('  Building SAME_GROUP edges...')
  const sameGroupEdges: Array<{ eventId: string; fromGuestId: string; toGuestId: string; weight: number; type: 'SAME_GROUP' }> = []

  for (const [, guestIds] of Object.entries(tagGuestMap)) {
    // 大群組取樣 60% pairs 避免爆量
    const maxPairs = guestIds.length > 20 ? Math.ceil(guestIds.length * 0.6) : guestIds.length
    const sampled = faker.helpers.arrayElements(guestIds, Math.min(maxPairs, guestIds.length))

    for (let i = 0; i < sampled.length; i++) {
      for (let j = i + 1; j < sampled.length; j++) {
        const [a, b] = [sampled[i], sampled[j]].sort()
        sameGroupEdges.push({
          eventId,
          fromGuestId: a,
          toGuestId: b,
          weight: 1.0,
          type: 'SAME_GROUP',
        })
      }
    }
  }

  // 去重（同一 pair 可能在多個 tag 出現）
  const edgeKeySet = new Set<string>()
  const uniqueSameGroupEdges = sameGroupEdges.filter(e => {
    const key = `${e.fromGuestId}-${e.toGuestId}`
    if (edgeKeySet.has(key)) return false
    edgeKeySet.add(key)
    return true
  })

  await prisma.edge.createMany({
    data: uniqueSameGroupEdges,
    skipDuplicates: true,
  })
  console.log(`  Created ${uniqueSameGroupEdges.length} SAME_GROUP edges`)

  // 2. SeatPreferences：~65% confirmed guests 填 1-3 個偏好
  //    只有填過表單（CONFIRMED）的賓客才有偏好資料
  console.log('  Building SeatPreferences...')
  const preferences: Array<{ guestId: string; preferredId: string; rank: number }> = []
  const preferenceMap = new Map<string, string[]>() // guestId -> preferredIds

  for (const guest of guests) {
    // 只有 CONFIRMED guests 才會有 seatPreferences
    if (confirmedGuestIds && !confirmedGuestIds.has(guest.id)) continue
    if (faker.number.float({ min: 0, max: 1 }) > 0.65) continue

    const prefCount = faker.number.int({ min: 1, max: 3 })
    const preferred: string[] = []

    // 優先選同 tag 的人
    const sameTagGuests: string[] = []
    for (const tagId of guest.tagIds) {
      const ids = tagGuestMap[tagId] || []
      for (const id of ids) {
        if (id !== guest.id && !preferred.includes(id)) {
          sameTagGuests.push(id)
        }
      }
    }

    // 15% 機率跨 tag 選
    const allOtherGuests = guests.filter(g => g.id !== guest.id).map(g => g.id)

    for (let rank = 1; rank <= prefCount; rank++) {
      let target: string | undefined
      const crossTag = faker.number.float({ min: 0, max: 1 }) < 0.15

      if (!crossTag && sameTagGuests.length > 0) {
        const available = sameTagGuests.filter(id => !preferred.includes(id))
        if (available.length > 0) {
          target = faker.helpers.arrayElement(available)
        }
      }

      if (!target) {
        const available = allOtherGuests.filter(id => !preferred.includes(id))
        if (available.length > 0) {
          target = faker.helpers.arrayElement(available)
        }
      }

      if (target) {
        preferred.push(target)
        preferences.push({ guestId: guest.id, preferredId: target, rank })
      }
    }

    if (preferred.length > 0) {
      preferenceMap.set(guest.id, preferred)
    }
  }

  await prisma.seatPreference.createMany({
    data: preferences,
    skipDuplicates: true,
  })
  console.log(`  Created ${preferences.length} SeatPreferences`)

  // 3. MUTUAL / ONE_WAY edges from preferences
  console.log('  Building preference edges...')
  const prefEdges: Array<{ eventId: string; fromGuestId: string; toGuestId: string; weight: number; type: 'MUTUAL' | 'ONE_WAY' }> = []

  for (const [guestId, preferredIds] of preferenceMap) {
    for (const preferredId of preferredIds) {
      if (!guestSet.has(preferredId)) continue

      const reversePrefs = preferenceMap.get(preferredId) || []
      const isMutual = reversePrefs.includes(guestId)
      const [a, b] = [guestId, preferredId].sort()
      const key = `${a}-${b}`

      if (!edgeKeySet.has(key)) {
        edgeKeySet.add(key)
        prefEdges.push({
          eventId,
          fromGuestId: a,
          toGuestId: b,
          weight: isMutual ? 3.0 : 2.0,
          type: isMutual ? 'MUTUAL' : 'ONE_WAY',
        })
      }
    }
  }

  await prisma.edge.createMany({
    data: prefEdges,
    skipDuplicates: true,
  })
  console.log(`  Created ${prefEdges.length} preference edges`)

  // 4. INFERRED edges：~5% guests 作為跨群橋接
  console.log('  Building INFERRED edges...')
  const bridgeGuests = faker.helpers.arrayElements(
    guests.filter(g => g.tagIds.length >= 1),
    Math.ceil(guests.length * 0.05),
  )

  const inferredEdges: Array<{ eventId: string; fromGuestId: string; toGuestId: string; weight: number; type: 'INFERRED' }> = []

  for (const bridge of bridgeGuests) {
    // 跟隨機一位不同 tag 的 guest 連結
    const differentTagGuests = guests.filter(g =>
      g.id !== bridge.id && !g.tagIds.some(t => bridge.tagIds.includes(t)),
    )
    if (differentTagGuests.length === 0) continue

    const target = faker.helpers.arrayElement(differentTagGuests)
    const [a, b] = [bridge.id, target.id].sort()
    const key = `${a}-${b}`

    if (!edgeKeySet.has(key)) {
      edgeKeySet.add(key)
      inferredEdges.push({
        eventId,
        fromGuestId: a,
        toGuestId: b,
        weight: 0.5,
        type: 'INFERRED',
      })
    }
  }

  await prisma.edge.createMany({
    data: inferredEdges,
    skipDuplicates: true,
  })
  console.log(`  Created ${inferredEdges.length} INFERRED edges`)

  return preferenceMap
}
