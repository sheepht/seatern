import type { PrismaClient } from '@prisma/client'
import crypto from 'node:crypto'
import { CORPORATE_CONFIG } from './constants.js'
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
  assignContactsToTagsMulti,
} from './satisfaction-updater.js'

export async function seedCorporate(prisma: PrismaClient) {
  const config = CORPORATE_CONFIG
  console.log(`\n=== 建立公司尾牙場景：${config.eventName} ===`)

  // 1. User（固定 ID 以支援 dev bypass 登入）
  console.log('Step 1: 建立 User...')
  const user = await prisma.user.create({
    data: {
      id: '00000000-0000-0000-0000-000000000002',
      email: 'corporate@example.com',
      name: '人資部 王小姐',
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

  // 5. Guests — 按部門分配 category，主管給較高 relationScore
  console.log(`Step 5: 建立 ${config.guestCount} Guests...`)
  const guestRecords: GuestRecord[] = []

  // 分配 contacts 到 tags
  const tagAssignments = assignContactsToTagsMulti(
    contacts, tags, config.tags.map(t => t.estimatedCount),
  )

  for (const batch of chunk(contacts, 50)) {
    const created = await prisma.$transaction(
      batch.map(contact => {
        const category = weightedCategory(config.categoryDistribution)
        const rsvp = randomRsvpStatus()

        // 主管給較高 relationScore
        const isManager = tagAssignments.get(tags[7].id)?.includes(contact.id) // '主管' tag
        const isVip = tagAssignments.get(tags[8].id)?.includes(contact.id) // 'VIP' tag
        let relationScore: number
        if (isVip) relationScore = 3
        else if (isManager) relationScore = faker.number.int({ min: 2, max: 3 })
        else relationScore = faker.number.int({ min: 1, max: 2 })

        const formData = rsvpGuestData(rsvp, {
          attendeeWeights: [{ value: 1, weight: 70 }, { value: 2, weight: 35 }],
          infantRate: 0.03,
        })
        return prisma.guest.create({
          data: {
            eventId: event.id,
            contactId: contact.id,
            category,
            relationScore,
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

  // 7. Tables — 8 columns x 5 rows
  console.log(`Step 7: 建立 ${config.tableCount} Tables...`)
  const positions = generateTablePositions(config.tableCount, 8)

  // 部門名稱桌名
  const deptNames = ['研發', '業務', '行銷', '人資', '財務', '管理']
  const tableData = positions.map((pos, i) => {
    let name: string
    if (i === 0) name = '主桌'
    else if (i <= 12) {
      const dept = deptNames[Math.floor((i - 1) / 2)]
      const suffix = (i - 1) % 2 === 0 ? 'A' : 'B'
      name = `${dept}桌${suffix}`
    } else {
      name = `混合桌${String.fromCharCode(65 + i - 13)}`
    }
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

  // 8. 分配 guests 到桌次
  console.log('Step 8: 分配賓客到桌次...')
  const confirmedDb = await prisma.guest.findMany({
    where: { eventId: event.id, rsvpStatus: 'CONFIRMED' },
    select: { id: true, relationScore: true },
  })
  const confirmedIds = new Set(confirmedDb.map(g => g.id))

  const tableAssignment = new Map<string, string[]>()
  for (const t of tables) {
    tableAssignment.set(t.id, [])
  }
  const assignedGuestIds = new Set<string>()

  // 主桌：VIP + 高分主管
  const vipGuests = confirmedDb
    .filter(g => g.relationScore >= 3)
    .slice(0, config.tableCapacity)
  for (const g of vipGuests) {
    tableAssignment.get(tables[0].id)!.push(g.id)
    assignedGuestIds.add(g.id)
  }

  // 按部門（category）分配
  const categoryToTables: Record<string, number[]> = {
    '研發部': [1, 2, 3],
    '業務部': [4, 5, 6],
    '行銷部': [7, 8],
    '人資部': [9, 10],
    '財務部': [11, 12],
    '管理層': [0], // 已經處理過主桌
  }

  for (const guest of guestRecords) {
    if (assignedGuestIds.has(guest.id) || !confirmedIds.has(guest.id)) continue

    const tableIndices = categoryToTables[guest.category || ''] || []
    let placed = false

    for (const idx of tableIndices) {
      const table = tables[idx]
      if (!table) continue
      const assigned = tableAssignment.get(table.id)!
      if (assigned.length < config.tableCapacity) {
        assigned.push(guest.id)
        assignedGuestIds.add(guest.id)
        placed = true
        break
      }
    }

    if (!placed) {
      // 溢出到混合桌
      for (let i = 13; i < tables.length; i++) {
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
  const guestInfos = buildGuestInfos(guestRecords, tableAssignment)
  const preferenceMap = await buildSocialGraph(prisma, event.id, guestInfos, tagGuestMap, confirmedIds)

  // 10. 計算 satisfactionScore
  console.log('Step 10: 計算滿意度...')
  await computeAndUpdateSatisfaction(prisma, event.id, guestRecords, tableAssignment, preferenceMap, tables)

  console.log(`=== 公司尾牙場景完成 ===\n`)
}

