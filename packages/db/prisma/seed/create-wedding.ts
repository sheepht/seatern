import type { PrismaClient } from '@prisma/client'
import crypto from 'node:crypto'
import { WEDDING_CONFIG } from './constants.js'
import {
  generateChineseName,
  generateTablePositions,
  randomRsvpStatus,
  rsvpGuestData,
  weightedCategory,
  faker,
  chunk,
} from './helpers.js'
import { buildSocialGraph } from './graph-builder.js'
import {
  type GuestRecord,
  computeAndUpdateSatisfaction,
  buildGuestTagAssociations,
  buildGuestInfos,
} from './satisfaction-updater.js'

export async function seedWedding(prisma: PrismaClient) {
  const config = WEDDING_CONFIG
  console.log(`\n=== 建立婚禮場景：${config.eventName} ===`)

  // 1. User（固定 ID 以支援 dev bypass 登入）
  console.log('Step 1: 建立 User...')
  const user = await prisma.user.create({
    data: {
      id: '00000000-0000-0000-0000-000000000001',
      email: 'wedding@example.com',
      name: '新郎志明',
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

  // 5. Guests
  console.log(`Step 5: 建立 ${config.guestCount} Guests...`)
  const guestRecords: GuestRecord[] = []

  // 先依 tag estimatedCount 分配 contacts 到 tags
  const tagAssignments = assignContactsToTags(contacts, tags, config)

  for (const batch of chunk(contacts, 50)) {
    const created = await prisma.$transaction(
      batch.map(contact => {
        const category = weightedCategory(config.categoryDistribution)
        const rsvp = randomRsvpStatus()
        const formData = rsvpGuestData(rsvp)
        return prisma.guest.create({
          data: {
            eventId: event.id,
            contactId: contact.id,
            category,
            relationScore: faker.number.int({ min: 1, max: 3 }),
            rsvpStatus: rsvp,
            ...formData,
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
  const { guestTagData, tagGuestMap } = buildGuestTagAssociations(guestRecords, tags, tagAssignments)
  await prisma.guestTag.createMany({ data: guestTagData, skipDuplicates: true })
  console.log(`  Created ${guestTagData.length} guest-tag associations`)

  // 7. Tables
  console.log(`Step 7: 建立 ${config.tableCount} Tables...`)
  const positions = generateTablePositions(config.tableCount, 5) // 5 columns
  const tableNames = [
    '主桌', '家人桌A', '家人桌B', '大學同學桌', '高中同學桌',
    '男方同事桌A', '男方同事桌B', '女方同事桌A', '女方同事桌B', '教會桌',
    '社團桌', '共同好友桌', '鄰居桌', '混合桌A', '混合桌B',
  ]

  const tables = await prisma.$transaction(
    positions.map((pos, i) =>
      prisma.table.create({
        data: {
          eventId: event.id,
          name: tableNames[i] || `第${i + 1}桌`,
          capacity: config.tableCapacity,
          positionX: pos.x,
          positionY: pos.y,
        },
      }),
    ),
  )
  console.log(`  Created ${tables.length} tables`)

  // 8. 分配 confirmed guests 到桌次
  console.log('Step 8: 分配賓客到桌次...')
  const dbGuests = await prisma.guest.findMany({
    where: { eventId: event.id, rsvpStatus: 'CONFIRMED' },
    select: { id: true },
  })
  const confirmedIds = new Set(dbGuests.map(g => g.id))

  // 分配：先按 tag 分到對應桌，溢出放混合桌
  const tableAssignment = new Map<string, string[]>() // tableId -> guestIds
  for (const t of tables) {
    tableAssignment.set(t.id, [])
  }

  const assignedGuestIds = new Set<string>()
  const tagToTableHint: Record<string, number> = {
    [tags[0].id]: 1, // 男方家人 -> 家人桌A
    [tags[1].id]: 2, // 女方家人 -> 家人桌B
    [tags[2].id]: 3, // 大學同學
    [tags[3].id]: 4, // 高中同學
    [tags[4].id]: 5, // 男方同事A
    [tags[5].id]: 7, // 女方同事A
    [tags[6].id]: 9, // 教會
    [tags[7].id]: 10, // 社團
    [tags[8].id]: 12, // 鄰居
    [tags[9].id]: 11, // 共同好友
  }

  // 主桌：relationScore 3 的人
  const vipGuests = guestRecords.filter(g => confirmedIds.has(g.id))
  const vipFromDb = await prisma.guest.findMany({
    where: { id: { in: vipGuests.map(g => g.id) }, relationScore: 3 },
    select: { id: true },
    take: config.tableCapacity,
  })
  for (const g of vipFromDb) {
    tableAssignment.get(tables[0].id)!.push(g.id)
    assignedGuestIds.add(g.id)
  }

  // 按 tag 分配
  for (const [tagId, hintIdx] of Object.entries(tagToTableHint)) {
    const table = tables[hintIdx]
    if (!table) continue
    const guestIds = tagGuestMap[tagId] || []
    for (const gid of guestIds) {
      if (assignedGuestIds.has(gid) || !confirmedIds.has(gid)) continue
      const assigned = tableAssignment.get(table.id)!
      if (assigned.length >= config.tableCapacity) {
        // 溢出到下一桌
        const nextTable = tables[hintIdx + 1] || tables[tables.length - 1]
        const nextAssigned = tableAssignment.get(nextTable.id)!
        if (nextAssigned.length < config.tableCapacity) {
          nextAssigned.push(gid)
          assignedGuestIds.add(gid)
          // 標記溢出
          await prisma.guest.update({ where: { id: gid }, data: { isOverflow: true } })
        }
        continue
      }
      assigned.push(gid)
      assignedGuestIds.add(gid)
    }
  }

  // 剩餘 confirmed 但未分配的放混合桌
  for (const g of guestRecords) {
    if (assignedGuestIds.has(g.id) || !confirmedIds.has(g.id)) continue
    for (const table of tables) {
      const assigned = tableAssignment.get(table.id)!
      if (assigned.length < config.tableCapacity) {
        assigned.push(g.id)
        assignedGuestIds.add(g.id)
        break
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
  const guestInfos = buildGuestInfos(guestRecords, tableAssignment)
  const preferenceMap = await buildSocialGraph(prisma, event.id, guestInfos, tagGuestMap, confirmedIds)

  // 10. 計算 satisfactionScore
  console.log('Step 10: 計算滿意度...')
  await computeAndUpdateSatisfaction(prisma, event.id, guestRecords, tableAssignment, preferenceMap, tables)

  console.log(`=== 婚禮場景完成 ===\n`)
}

/** 將 contacts 分配到 tags（按 estimatedCount） */
function assignContactsToTags(
  contacts: Array<{ id: string }>,
  tags: Array<{ id: string }>,
  config: typeof WEDDING_CONFIG,
): Map<string, string[]> {
  const result = new Map<string, string[]>()
  const assigned = new Set<string>()

  for (let i = 0; i < tags.length; i++) {
    const tag = tags[i]
    const tagConfig = config.tags[i]
    const count = tagConfig.estimatedCount
    result.set(tag.id, [])

    const available = contacts.filter(c => !assigned.has(c.id))
    const selected = available.slice(0, Math.min(count, available.length))
    for (const c of selected) {
      result.get(tag.id)!.push(c.id)
      assigned.add(c.id)
    }
  }

  // 部分 guest 給 2 個 tags（~20%）
  const multiTagCount = Math.ceil(contacts.length * 0.2)
  const tagIds = tags.map(t => t.id)
  for (let i = 0; i < multiTagCount; i++) {
    const contact = contacts[i]
    // 找已有的 tag
    const currentTags = tagIds.filter(tid => result.get(tid)?.includes(contact.id))
    if (currentTags.length >= 2) continue
    // 加一個額外 tag
    const otherTags = tagIds.filter(tid => !currentTags.includes(tid))
    if (otherTags.length > 0) {
      const randomTag = otherTags[Math.floor(Math.random() * otherTags.length)]
      result.get(randomTag)!.push(contact.id)
    }
  }

  return result
}

