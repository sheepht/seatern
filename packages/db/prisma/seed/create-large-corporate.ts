import type { PrismaClient } from '@prisma/client'
import crypto from 'node:crypto'
import { LARGE_CORPORATE_CONFIG } from './constants.js'
import {
  generateChineseName,
  generateTablePositions,
  randomRsvpStatus,
  randomDietaryNote,
  randomSpecialNote,
  computeSatisfaction,
  weightedCategory,
  faker,
  chunk,
} from './helpers.js'
import { buildSocialGraph } from './graph-builder.js'

export async function seedLargeCorporate(prisma: PrismaClient) {
  const config = LARGE_CORPORATE_CONFIG
  console.log(`\n=== 建立大型企業春酒場景：${config.eventName} ===`)

  // 1. User（固定 ID 以支援 dev bypass 登入）
  console.log('Step 1: 建立 User...')
  const user = await prisma.user.create({
    data: {
      id: '00000000-0000-0000-0000-000000000003',
      email: 'large-corp@example.com',
      name: '行政部 李經理',
    },
  })

  // 2. Contacts
  console.log(`Step 2: 建立 ${config.guestCount} Contacts...`)
  const contacts: Array<{ id: string; name: string; aliases: string[] }> = []

  for (const batch of chunk(Array.from({ length: config.guestCount }), 50)) {
    const created = await prisma.$transaction(
      batch.map(() => {
        const { name, aliases } = generateChineseName()
        return prisma.contact.create({
          data: {
            userId: user.id,
            name,
            aliases,
            email: faker.internet.email(),
            phone: faker.phone.number({ style: 'national' }),
          },
          select: { id: true, name: true, aliases: true },
        })
      }),
    )
    contacts.push(...created)
  }
  console.log(`  Created ${contacts.length} contacts`)

  // 3. Event
  console.log('Step 3: 建立 Event...')
  const event = await prisma.event.create({
    data: {
      userId: user.id,
      name: config.eventName,
      date: new Date(config.eventDate),
      type: config.eventType,
      categories: config.categories,
    },
  })

  // 4. Tags
  console.log('Step 4: 建立 Tags...')
  const tags = await prisma.$transaction(
    config.tags.map(t =>
      prisma.tag.create({
        data: {
          eventId: event.id,
          name: t.name,
          category: t.category,
        },
      }),
    ),
  )
  console.log(`  Created ${tags.length} tags`)

  // Tag index references (based on LARGE_CORPORATE_CONFIG.tags order)
  const managerTagIdx = 16  // '高階主管'
  const vipTagIdx = 17      // 'VIP 貴賓'

  // 5. Guests
  console.log(`Step 5: 建立 ${config.guestCount} Guests...`)
  const guestRecords: Array<{ id: string; contactId: string; category: string | null; tagIds: string[]; assignedTableId: string | null }> = []

  const tagAssignments = assignContactsToTags(contacts, tags, config)

  for (const batch of chunk(contacts, 50)) {
    const created = await prisma.$transaction(
      batch.map(contact => {
        const category = weightedCategory(config.categoryDistribution)
        const rsvp = randomRsvpStatus()

        const isManager = tagAssignments.get(tags[managerTagIdx].id)?.includes(contact.id)
        const isVip = tagAssignments.get(tags[vipTagIdx].id)?.includes(contact.id)
        let relationScore: number
        if (isVip) relationScore = 3
        else if (isManager) relationScore = faker.number.int({ min: 2, max: 3 })
        else relationScore = faker.number.int({ min: 1, max: 2 })

        return prisma.guest.create({
          data: {
            eventId: event.id,
            contactId: contact.id,
            category,
            relationScore,
            rsvpStatus: rsvp,
            attendeeCount: rsvp === 'CONFIRMED' || rsvp === 'MODIFIED'
              ? faker.helpers.weightedArrayElement([
                { value: 1, weight: 75 },
                { value: 2, weight: 25 },
              ])
              : 1,
            infantCount: faker.number.float({ min: 0, max: 1 }) < 0.02 ? 1 : 0,
            dietaryNote: randomDietaryNote(),
            specialNote: randomSpecialNote(),
            formToken: crypto.randomUUID(),
          },
          select: { id: true, contactId: true, category: true },
        })
      }),
    )
    for (const g of created) {
      guestRecords.push({
        id: g.id,
        contactId: g.contactId,
        category: g.category,
        tagIds: [],
        assignedTableId: null,
      })
    }
  }
  console.log(`  Created ${guestRecords.length} guests`)

  // 6. GuestTags
  console.log('Step 6: 建立 GuestTag 關聯...')
  const guestTagData: Array<{ guestId: string; tagId: string }> = []
  const tagGuestMap: Record<string, string[]> = {}
  const contactToGuest = new Map(guestRecords.map(g => [g.contactId, g.id]))

  for (const tag of tags) {
    tagGuestMap[tag.id] = []
    const contactIds = tagAssignments.get(tag.id) || []
    for (const contactId of contactIds) {
      const guestId = contactToGuest.get(contactId)
      if (guestId) {
        guestTagData.push({ guestId, tagId: tag.id })
        tagGuestMap[tag.id].push(guestId)
        const gr = guestRecords.find(g => g.id === guestId)
        if (gr) gr.tagIds.push(tag.id)
      }
    }
  }

  await prisma.guestTag.createMany({ data: guestTagData, skipDuplicates: true })
  console.log(`  Created ${guestTagData.length} guest-tag associations`)

  // 7. Tables — 10 columns layout for 80 tables
  console.log(`Step 7: 建立 ${config.tableCount} Tables...`)
  const positions = generateTablePositions(config.tableCount, 10)

  // 桌名：依廠區分區
  const tableData = positions.map((pos, i) => {
    let name: string
    if (i === 0) name = '主桌'
    // 新竹總部 1-20
    else if (i <= 20) name = `新竹${String(i).padStart(2, '0')}`
    // 台中廠區 21-44
    else if (i <= 44) name = `台中${String(i - 20).padStart(2, '0')}`
    // 台南廠區 45-64
    else if (i <= 64) name = `台南${String(i - 44).padStart(2, '0')}`
    // 海外 + 混合
    else name = `混合${String.fromCharCode(65 + i - 65)}`
    return { name, positionX: pos.x, positionY: pos.y }
  })

  const tables = await prisma.$transaction(
    tableData.map(t =>
      prisma.table.create({
        data: {
          eventId: event.id,
          name: t.name,
          capacity: config.tableCapacity,
          positionX: t.positionX,
          positionY: t.positionY,
        },
      }),
    ),
  )
  console.log(`  Created ${tables.length} tables`)

  // 8. 分配 guests 到桌次（按廠區 category）
  console.log('Step 8: 分配賓客到桌次...')
  const confirmedDb = await prisma.guest.findMany({
    where: { eventId: event.id, rsvpStatus: { in: ['CONFIRMED', 'MODIFIED'] } },
    select: { id: true, relationScore: true },
  })
  const confirmedIds = new Set(confirmedDb.map(g => g.id))

  const tableAssignment = new Map<string, string[]>()
  for (const t of tables) {
    tableAssignment.set(t.id, [])
  }
  const assignedGuestIds = new Set<string>()

  // 主桌：VIP + 高階主管
  const vipGuests = confirmedDb
    .filter(g => g.relationScore >= 3)
    .slice(0, config.tableCapacity)
  for (const g of vipGuests) {
    tableAssignment.get(tables[0].id)!.push(g.id)
    assignedGuestIds.add(g.id)
  }

  // 按廠區（category）分配到對應桌號範圍
  const categoryToTableRange: Record<string, [number, number]> = {
    '新竹總部': [1, 20],
    '台中廠區': [21, 44],
    '台南廠區': [45, 64],
    '海外據點': [65, 72],
  }

  for (const guest of guestRecords) {
    if (assignedGuestIds.has(guest.id) || !confirmedIds.has(guest.id)) continue

    const range = categoryToTableRange[guest.category || '']
    let placed = false

    if (range) {
      for (let idx = range[0]; idx <= range[1] && idx < tables.length; idx++) {
        const table = tables[idx]
        const assigned = tableAssignment.get(table.id)!
        if (assigned.length < config.tableCapacity) {
          assigned.push(guest.id)
          assignedGuestIds.add(guest.id)
          placed = true
          break
        }
      }
    }

    if (!placed) {
      // 溢出到混合桌（尾部）
      for (let i = 73; i < tables.length; i++) {
        const table = tables[i]
        const assigned = tableAssignment.get(table.id)!
        if (assigned.length < config.tableCapacity) {
          assigned.push(guest.id)
          assignedGuestIds.add(guest.id)
          await prisma.guest.update({ where: { id: guest.id }, data: { isOverflow: true } })
          break
        }
      }
    }
  }

  // 寫入 assignedTableId
  for (const [tableId, guestIds] of tableAssignment) {
    if (guestIds.length > 0) {
      await prisma.guest.updateMany({
        where: { id: { in: guestIds } },
        data: { assignedTableId: tableId },
      })
    }
  }

  const totalAssigned = [...tableAssignment.values()].reduce((sum, ids) => sum + ids.length, 0)
  console.log(`  Assigned ${totalAssigned} guests to tables`)

  // 9. Social Graph
  console.log('Step 9: 建立社交圖...')
  const guestInfos = guestRecords.map(g => ({
    id: g.id,
    tagIds: g.tagIds,
    assignedTableId: null as string | null,
  }))
  for (const [tableId, guestIds] of tableAssignment) {
    for (const gid of guestIds) {
      const gi = guestInfos.find(g => g.id === gid)
      if (gi) gi.assignedTableId = tableId
    }
  }

  const preferenceMap = await buildSocialGraph(prisma, event.id, guestInfos, tagGuestMap)

  // 10. 計算 satisfactionScore
  console.log('Step 10: 計算滿意度...')
  await computeAndUpdateSatisfaction(prisma, event.id, guestRecords, tableAssignment, tagGuestMap, preferenceMap, tables)

  console.log(`=== 大型企業春酒場景完成 ===\n`)
}

/** 將 contacts 分配到 tags（按 estimatedCount） */
function assignContactsToTags(
  contacts: Array<{ id: string }>,
  tags: Array<{ id: string }>,
  config: typeof LARGE_CORPORATE_CONFIG,
): Map<string, string[]> {
  const result = new Map<string, string[]>()
  const usedCounts = new Map<string, number>()

  for (const tag of tags) {
    result.set(tag.id, [])
  }

  for (let i = 0; i < tags.length; i++) {
    const tag = tags[i]
    const tagConfig = config.tags[i]
    const count = tagConfig.estimatedCount

    const available = contacts
      .filter(c => (usedCounts.get(c.id) || 0) < 2)
      .sort(() => Math.random() - 0.5)

    const selected = available.slice(0, Math.min(count, available.length))
    for (const c of selected) {
      result.get(tag.id)!.push(c.id)
      usedCounts.set(c.id, (usedCounts.get(c.id) || 0) + 1)
    }
  }

  return result
}

/** 計算並更新滿意度分數 */
async function computeAndUpdateSatisfaction(
  prisma: PrismaClient,
  eventId: string,
  guestRecords: Array<{ id: string; tagIds: string[] }>,
  tableAssignment: Map<string, string[]>,
  tagGuestMap: Record<string, string[]>,
  preferenceMap: Map<string, string[]>,
  tables: Array<{ id: string }>,
) {
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

  const dbTables = await prisma.table.findMany({ where: { eventId }, select: { id: true, positionX: true, positionY: true } })
  const tablePositions = new Map(dbTables.map(t => [t.id, { x: t.positionX, y: t.positionY }]))

  function getAdjacentTableIds(tableId: string): string[] {
    const pos = tablePositions.get(tableId)
    if (!pos) return []
    return dbTables
      .filter(t => t.id !== tableId)
      .map(t => ({ id: t.id, dist: Math.sqrt((t.positionX - pos.x) ** 2 + (t.positionY - pos.y) ** 2) }))
      .sort((a, b) => a.dist - b.dist)
      .slice(0, 2)
      .map(d => d.id)
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
        if (otherTags.has(t)) { sameTagCount++; break }
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
      if (adjSet) for (const gid of adjSet) adjacentGuests.add(gid)
    }

    for (const prefId of prefs) {
      if (sameTableGuests.has(prefId)) preferenceMatches++
      else if (adjacentGuests.has(prefId)) preferenceNearby = true
    }

    const score = computeSatisfaction({
      sameTagRatio,
      preferenceMatches,
      totalPreferences: prefs.length,
      preferenceNearby,
    })

    updates.push({ id: guest.id, score })
  }

  for (const batch of chunk(updates, 50)) {
    await prisma.$transaction(
      batch.map(u =>
        prisma.guest.update({
          where: { id: u.id },
          data: { satisfactionScore: u.score },
        }),
      ),
    )
  }

  for (const table of tables) {
    const guestIds = tableAssignment.get(table.id) || []
    if (guestIds.length === 0) continue
    const scores = updates.filter(u => guestIds.includes(u.id)).map(u => u.score)
    const avg = scores.reduce((a, b) => a + b, 0) / scores.length
    await prisma.table.update({
      where: { id: table.id },
      data: { averageSatisfaction: Math.round(avg * 10) / 10 },
    })
  }

  const isolated = guestRecords.filter(g => {
    const prefs = preferenceMap.get(g.id)
    const hasPrefs = prefs && prefs.length > 0
    const isPreferredBySomeone = [...preferenceMap.values()].some(pids => pids.includes(g.id))
    return !hasPrefs && !isPreferredBySomeone && g.tagIds.length === 0
  })

  if (isolated.length > 0) {
    await prisma.guest.updateMany({
      where: { id: { in: isolated.map(g => g.id) } },
      data: { isIsolated: true },
    })
    console.log(`  Marked ${isolated.length} guests as isolated`)
  }

  const avgScore = updates.reduce((a, b) => a + b.score, 0) / updates.length
  console.log(`  Average satisfaction: ${avgScore.toFixed(1)}`)
}
