import { Hono } from 'hono'
import { prisma } from '@seatern/db'
import type { OwnerType } from '@prisma/client'
import type { SessionEnv } from '../middleware/session'

const events = new Hono<SessionEnv>()

/** Dev 模式下放寬 owner 檢查：先用 owner 查，找不到就用 ID 查 */
async function findEventWithDevFallback(
  eventId: string,
  ownerId: string,
  ownerType: string,
) {
  const event = await prisma.event.findFirst({
    where: { id: eventId, ownerId, ownerType: ownerType as OwnerType },
  })
  if (event) return event

  if (process.env.NODE_ENV !== 'production') {
    return prisma.event.findUnique({ where: { id: eventId } })
  }
  return null
}

// GET /events — 列出當前用戶的所有活動
events.get('/', async (c) => {
  const ownerId = c.get('ownerId')
  const ownerType = c.get('ownerType')

  const list = await prisma.event.findMany({
    where: { ownerId, ownerType },
    orderBy: { updatedAt: 'desc' },
  })
  return c.json(list)
})

// GET /events/mine — 取得當前 session 的唯一活動（含賓客、桌次等）
events.get('/mine', async (c) => {
  const ownerId = c.get('ownerId')
  const ownerType = c.get('ownerType')

  const include = {
    guests: {
      include: {
        seatPreferences: true,
        subcategory: true,
      },
      orderBy: { name: 'asc' } as const,
    },
    tables: { orderBy: { name: 'asc' } as const },
    subcategories: { orderBy: { name: 'asc' } as const },
    edges: true,
    avoidPairs: true,
    snapshots: { orderBy: { createdAt: 'desc' } as const },
  }

  const event = await prisma.event.findFirst({
    where: { ownerId, ownerType },
    include,
    orderBy: { updatedAt: 'desc' },
  })

  if (!event) return c.json({ error: 'No event found' }, 404)
  return c.json(event)
})

// GET /events/:id — 取得單一活動（含賓客、桌次、標籤）
events.get('/:id', async (c) => {
  const ownerId = c.get('ownerId')
  const ownerType = c.get('ownerType')
  const id = c.req.param('id')

  const include = {
    guests: {
      include: {
        seatPreferences: true,
        subcategory: true,
      },
      orderBy: { name: 'asc' } as const,
    },
    tables: { orderBy: { name: 'asc' } as const },
    subcategories: { orderBy: { name: 'asc' } as const },
    edges: true,
    avoidPairs: true,
    snapshots: { orderBy: { createdAt: 'desc' } as const },
  }

  // 先用 owner 過濾，dev 模式 fallback 到 ID 查
  const eventBase = await findEventWithDevFallback(id, ownerId, ownerType)
  const event = eventBase
    ? await prisma.event.findUnique({ where: { id: eventBase.id }, include })
    : null

  if (!event) return c.json({ error: 'Event not found' }, 404)
  return c.json(event)
})

// POST /events — 建立新活動
events.post('/', async (c) => {
  const ownerId = c.get('ownerId')
  const ownerType = c.get('ownerType')
  const body = await c.req.json<{ name: string; date?: string; type?: string; categories?: string[] }>()

  const event = await prisma.event.create({
    data: {
      name: body.name,
      date: body.date,
      type: (body.type as any) || 'wedding',
      categories: body.categories || ['男方', '女方', '共同'],
      ownerId,
      ownerType,
    },
  })
  return c.json(event, 201)
})

// ─── 賓客 CRUD ──────────────────────────────────────

// POST /events/:id/guests — 批次建立賓客（匯入用）
events.post('/:id/guests/batch', async (c) => {
  const ownerId = c.get('ownerId')
  const ownerType = c.get('ownerType')
  const eventId = c.req.param('id')

  // 驗證活動歸屬
  const event = await findEventWithDevFallback(eventId, ownerId, ownerType)
  if (!event) return c.json({ error: 'Event not found' }, 404)

  const body = await c.req.json<{
    guests: Array<{
      name: string
      aliases?: string[]
      category?: string
      rsvpStatus?: string
      companionCount?: number
      dietaryNote?: string
      specialNote?: string
    }>
  }>()

  const created = await prisma.$transaction(
    body.guests.map((g) =>
      prisma.guest.create({
        data: {
          eventId,
          name: g.name,
          aliases: g.aliases || [],
          category: g.category,
          rsvpStatus: (g.rsvpStatus as any) || 'confirmed',
          companionCount: g.companionCount ?? 0,
          dietaryNote: g.dietaryNote,
          specialNote: g.specialNote,
        },
      })
    )
  )

  return c.json({ count: created.length, guests: created }, 201)
})

// PATCH /events/:eventId — 更新活動（名稱等）
events.patch('/:eventId', async (c) => {
  const ownerId = c.get('ownerId')
  const ownerType = c.get('ownerType')
  const { eventId } = c.req.param()

  const event = await findEventWithDevFallback(eventId, ownerId, ownerType)
  if (!event) return c.json({ error: 'Event not found' }, 404)

  const body = await c.req.json<{ name?: string }>()
  const updated = await prisma.event.update({
    where: { id: eventId },
    data: { ...(body.name !== undefined && { name: body.name }) },
  })
  return c.json(updated)
})

// PATCH /events/:eventId/guests/assign-batch — 批次更新賓客桌次分配（自動分配用）
events.patch('/:eventId/guests/assign-batch', async (c) => {
  const ownerId = c.get('ownerId')
  const ownerType = c.get('ownerType')
  const { eventId } = c.req.param()

  const event = await findEventWithDevFallback(eventId, ownerId, ownerType)
  if (!event) return c.json({ error: 'Event not found' }, 404)

  const body = await c.req.json<{
    assignments: Array<{ guestId: string; tableId: string | null; seatIndex?: number | null }>
  }>()

  // 正規化：空字串視為 null
  const normalized = body.assignments.map((a) => ({
    ...a,
    tableId: a.tableId || null,
  }))

  // 驗證所有非 null 的 tableId 都存在
  const tableIds = [...new Set(normalized.filter((a) => a.tableId).map((a) => a.tableId!))]
  if (tableIds.length > 0) {
    const existingTables = await prisma.table.findMany({
      where: { id: { in: tableIds }, eventId },
      select: { id: true },
    })
    const existingIds = new Set(existingTables.map((t) => t.id))
    const missing = tableIds.filter((id) => !existingIds.has(id))
    if (missing.length > 0) {
      return c.json({ error: `Tables not found: ${missing.join(', ')}` }, 400)
    }
  }

  await prisma.$transaction(
    normalized.map((a) =>
      prisma.guest.update({
        where: { id: a.guestId },
        data: {
          assignedTableId: a.tableId,
          seatIndex: a.tableId === null ? null : (a.seatIndex ?? null),
        },
      })
    )
  )

  return c.json({ count: normalized.length })
})

// PATCH /events/:eventId/guests/:guestId/table — 移動賓客到桌次
events.patch('/:eventId/guests/:guestId/table', async (c) => {
  const ownerId = c.get('ownerId')
  const ownerType = c.get('ownerType')
  const { eventId, guestId } = c.req.param()

  const event = await findEventWithDevFallback(eventId, ownerId, ownerType)
  if (!event) return c.json({ error: 'Event not found' }, 404)

  const body = await c.req.json<{ tableId: string | null; seatIndex?: number | null }>()

  const guest = await prisma.guest.update({
    where: { id: guestId },
    data: {
      assignedTableId: body.tableId,
      seatIndex: body.tableId === null ? null : (body.seatIndex ?? null),
    },
  })

  return c.json(guest)
})

// POST /events/:eventId/guests — 新增單筆賓客
events.post('/:eventId/guests', async (c) => {
  const ownerId = c.get('ownerId')
  const ownerType = c.get('ownerType')
  const { eventId } = c.req.param()

  const event = await findEventWithDevFallback(eventId, ownerId, ownerType)
  if (!event) return c.json({ error: 'Event not found' }, 404)

  const body = await c.req.json<{
    name: string
    aliases?: string[]
    category?: string
    rsvpStatus?: string
    companionCount?: number
    dietaryNote?: string
    specialNote?: string
  }>()

  if (!body.name?.trim()) return c.json({ error: 'Name is required' }, 400)

  const guest = await prisma.guest.create({
    data: {
      eventId,
      name: body.name.trim(),
      aliases: body.aliases || [],
      category: body.category,
      rsvpStatus: (body.rsvpStatus as any) || 'confirmed',
      companionCount: body.companionCount ?? 0,
      dietaryNote: body.dietaryNote,
      specialNote: body.specialNote,
    },
    include: {
      seatPreferences: true,
      subcategory: true,
    },
  })

  return c.json(guest, 201)
})

// PATCH /events/:eventId/guests/:guestId — 更新單筆賓客（partial update, whitelist）
const GUEST_UPDATABLE_FIELDS = [
  'name', 'aliases', 'category', 'subcategoryId',
  'rsvpStatus', 'companionCount', 'dietaryNote', 'specialNote',
] as const

events.patch('/:eventId/guests/:guestId', async (c) => {
  const ownerId = c.get('ownerId')
  const ownerType = c.get('ownerType')
  const { eventId, guestId } = c.req.param()

  const event = await findEventWithDevFallback(eventId, ownerId, ownerType)
  if (!event) return c.json({ error: 'Event not found' }, 404)

  const body = await c.req.json<Record<string, any>>()

  // Whitelist: only allow known fields
  const data: Record<string, any> = {}
  for (const field of GUEST_UPDATABLE_FIELDS) {
    if (field in body) data[field] = body[field]
  }

  if (Object.keys(data).length === 0) return c.json({ error: 'No updatable fields provided' }, 400)

  // Validate name if provided
  if ('name' in data && !data.name?.trim()) return c.json({ error: 'Name cannot be empty' }, 400)
  if ('name' in data) data.name = data.name.trim()

  try {
    const guest = await prisma.guest.update({
      where: { id: guestId },
      data,
      include: {
        seatPreferences: true,
        subcategory: true,
      },
    })
    return c.json(guest)
  } catch (e: any) {
    if (e.code === 'P2025') return c.json({ error: 'Guest not found' }, 404)
    throw e
  }
})

// DELETE /events/:eventId/guests/:guestId — 刪除賓客（cascade: seatPrefs, avoidPairs, edges）
events.delete('/:eventId/guests/:guestId', async (c) => {
  const ownerId = c.get('ownerId')
  const ownerType = c.get('ownerType')
  const { eventId, guestId } = c.req.param()

  const event = await findEventWithDevFallback(eventId, ownerId, ownerType)
  if (!event) return c.json({ error: 'Event not found' }, 404)

  try {
    await prisma.guest.delete({ where: { id: guestId } })
    return c.json({ ok: true })
  } catch (e: any) {
    if (e.code === 'P2025') return c.json({ error: 'Guest not found' }, 404)
    throw e
  }
})

// ─── 桌次 CRUD ──────────────────────────────────────

// POST /events/:id/tables — 建立桌次
events.post('/:id/tables', async (c) => {
  const ownerId = c.get('ownerId')
  const ownerType = c.get('ownerType')
  const eventId = c.req.param('id')

  const event = await findEventWithDevFallback(eventId, ownerId, ownerType)
  if (!event) return c.json({ error: 'Event not found' }, 404)

  const body = await c.req.json<{ id?: string; name: string; capacity?: number; positionX?: number; positionY?: number }>()

  const table = await prisma.table.create({
    data: {
      ...(body.id && { id: body.id }),
      eventId,
      name: body.name,
      capacity: body.capacity ?? 10,
      positionX: body.positionX ?? 0,
      positionY: body.positionY ?? 0,
    },
  })

  return c.json(table, 201)
})

// PATCH /events/:eventId/tables/:tableId — 更新桌次（位置、名稱等）
events.patch('/:eventId/tables/:tableId', async (c) => {
  const ownerId = c.get('ownerId')
  const ownerType = c.get('ownerType')
  const { eventId, tableId } = c.req.param()

  const event = await findEventWithDevFallback(eventId, ownerId, ownerType)
  if (!event) return c.json({ error: 'Event not found' }, 404)

  const body = await c.req.json<{ name?: string; capacity?: number; positionX?: number; positionY?: number }>()

  const table = await prisma.table.update({
    where: { id: tableId },
    data: body,
  })

  return c.json(table)
})

// DELETE /events/:eventId/tables/:tableId — 刪除桌次（同時清除賓客分配）
events.delete('/:eventId/tables/:tableId', async (c) => {
  const ownerId = c.get('ownerId')
  const ownerType = c.get('ownerType')
  const { eventId, tableId } = c.req.param()

  const event = await findEventWithDevFallback(eventId, ownerId, ownerType)
  if (!event) return c.json({ error: 'Event not found' }, 404)

  // 清除該桌所有賓客的分配
  await prisma.guest.updateMany({
    where: { eventId, assignedTableId: tableId },
    data: { assignedTableId: null, seatIndex: null },
  })

  await prisma.table.delete({ where: { id: tableId } })

  return c.json({ ok: true })
})

// DELETE /events/:eventId/reset — 清除活動所有資料（賓客、桌次、偏好、避桌、子分類、快照）
events.delete('/:eventId/reset', async (c) => {
  const ownerId = c.get('ownerId')
  const ownerType = c.get('ownerType')
  const { eventId } = c.req.param()

  const event = await findEventWithDevFallback(eventId, ownerId, ownerType)
  if (!event) return c.json({ error: 'Event not found' }, 404)

  await prisma.$transaction([
    prisma.seatPreference.deleteMany({ where: { guest: { eventId } } }),
    prisma.avoidPair.deleteMany({ where: { eventId } }),
    prisma.edge.deleteMany({ where: { eventId } }),
    prisma.seatingSnapshot.deleteMany({ where: { eventId } }),
    prisma.guest.deleteMany({ where: { eventId } }),
    prisma.table.deleteMany({ where: { eventId } }),
    prisma.subcategory.deleteMany({ where: { eventId } }),
  ])

  return c.json({ ok: true })
})

// ─── 座位偏好 ────────────────────────────────────────

// POST /events/:id/preferences/batch — 批次建立座位偏好
events.post('/:id/preferences/batch', async (c) => {
  const ownerId = c.get('ownerId')
  const ownerType = c.get('ownerType')
  const eventId = c.req.param('id')

  const event = await findEventWithDevFallback(eventId, ownerId, ownerType)
  if (!event) return c.json({ error: 'Event not found' }, 404)

  const body = await c.req.json<{
    preferences: Array<{ guestId: string; preferredGuestId: string; rank: number }>
  }>()

  // 先清除該活動的所有舊偏好
  const guestIds = await prisma.guest.findMany({
    where: { eventId },
    select: { id: true },
  })
  const ids = guestIds.map((g) => g.id)
  await prisma.seatPreference.deleteMany({
    where: { guestId: { in: ids } },
  })

  // 建立新偏好
  const created = await prisma.$transaction(
    body.preferences.map((p) =>
      prisma.seatPreference.create({
        data: {
          guestId: p.guestId,
          preferredGuestId: p.preferredGuestId,
          rank: p.rank,
        },
      })
    )
  )

  return c.json({ count: created.length }, 201)
})

// PUT /events/:eventId/guests/:guestId/preferences — 替換單一賓客的座位偏好
events.put('/:eventId/guests/:guestId/preferences', async (c) => {
  const ownerId = c.get('ownerId')
  const ownerType = c.get('ownerType')
  const { eventId, guestId } = c.req.param()

  const event = await findEventWithDevFallback(eventId, ownerId, ownerType)
  if (!event) return c.json({ error: 'Event not found' }, 404)

  const body = await c.req.json<{
    preferences: Array<{ preferredGuestId: string; rank: number }>
  }>()

  if (body.preferences.length > 3) {
    return c.json({ error: 'Maximum 3 preferences allowed' }, 400)
  }

  // 刪除該賓客的舊偏好，再建立新的
  await prisma.seatPreference.deleteMany({ where: { guestId } })

  const created = await prisma.$transaction(
    body.preferences.map((p) =>
      prisma.seatPreference.create({
        data: {
          guestId,
          preferredGuestId: p.preferredGuestId,
          rank: p.rank,
        },
      })
    )
  )

  return c.json(created)
})

// ─── 子分類 ─────────────────────────────────────────────

// POST /events/:id/subcategories/batch — 批次建立子分類並關聯賓客
events.post('/:id/subcategories/batch', async (c) => {
  const ownerId = c.get('ownerId')
  const ownerType = c.get('ownerType')
  const eventId = c.req.param('id')

  const event = await findEventWithDevFallback(eventId, ownerId, ownerType)
  if (!event) return c.json({ error: 'Event not found' }, 404)

  const body = await c.req.json<{
    assignments: Array<{ guestId: string; subcategoryName: string; category: string }>
  }>()

  // Upsert subcategories
  const subcatMap = new Map<string, string>()
  const uniqueNames = [...new Set(body.assignments.map((a) => a.subcategoryName))]
  for (const name of uniqueNames) {
    const category = body.assignments.find((a) => a.subcategoryName === name)!.category
    const subcat = await prisma.subcategory.upsert({
      where: { eventId_name: { eventId, name } },
      create: { eventId, name, category },
      update: {},
    })
    subcatMap.set(name, subcat.id)
  }

  // Assign subcategory to guests
  let assigned = 0
  for (const a of body.assignments) {
    const subcategoryId = subcatMap.get(a.subcategoryName)
    if (!subcategoryId) continue
    await prisma.guest.update({
      where: { id: a.guestId },
      data: { subcategoryId },
    })
    assigned++
  }

  return c.json({ subcategories: uniqueNames.length, assigned }, 201)
})

// ─── 避免同桌 ────────────────────────────────────────

// POST /events/:id/avoid-pairs/batch — 批次建立避免同桌
events.post('/:id/avoid-pairs/batch', async (c) => {
  const ownerId = c.get('ownerId')
  const ownerType = c.get('ownerType')
  const eventId = c.req.param('id')

  const event = await findEventWithDevFallback(eventId, ownerId, ownerType)
  if (!event) return c.json({ error: 'Event not found' }, 404)

  const body = await c.req.json<{
    pairs: Array<{ guestAId: string; guestBId: string; reason?: string }>
  }>()

  let created = 0
  for (const p of body.pairs) {
    // 確保不重複（A-B 和 B-A 視為同一對）
    const existing = await prisma.avoidPair.findFirst({
      where: {
        eventId,
        OR: [
          { guestAId: p.guestAId, guestBId: p.guestBId },
          { guestAId: p.guestBId, guestBId: p.guestAId },
        ],
      },
    })
    if (existing) continue
    await prisma.avoidPair.create({
      data: { eventId, guestAId: p.guestAId, guestBId: p.guestBId, reason: p.reason },
    })
    created++
  }

  return c.json({ count: created }, 201)
})

// POST /events/:id/avoid-pairs
events.post('/:id/avoid-pairs', async (c) => {
  const ownerId = c.get('ownerId')
  const ownerType = c.get('ownerType')
  const eventId = c.req.param('id')

  const event = await findEventWithDevFallback(eventId, ownerId, ownerType)
  if (!event) return c.json({ error: 'Event not found' }, 404)

  const body = await c.req.json<{ guestAId: string; guestBId: string; reason?: string }>()

  const pair = await prisma.avoidPair.create({
    data: {
      eventId,
      guestAId: body.guestAId,
      guestBId: body.guestBId,
      reason: body.reason,
    },
  })

  return c.json(pair, 201)
})

// DELETE /events/:eventId/avoid-pairs/:pairId
events.delete('/:eventId/avoid-pairs/:pairId', async (c) => {
  const { pairId } = c.req.param()
  await prisma.avoidPair.delete({ where: { id: pairId } })
  return c.json({ ok: true })
})

// ─── 快照 ────────────────────────────────────────────

// POST /events/:id/snapshots
events.post('/:id/snapshots', async (c) => {
  const ownerId = c.get('ownerId')
  const ownerType = c.get('ownerType')
  const eventId = c.req.param('id')

  const event = await findEventWithDevFallback(eventId, ownerId, ownerType)
  if (!event) return c.json({ error: 'Event not found' }, 404)

  const body = await c.req.json<{ name: string; data: any; averageSatisfaction: number }>()

  // 免費版限制 1 份快照
  const existing = await prisma.seatingSnapshot.count({ where: { eventId } })
  if (existing >= 1) {
    // 覆蓋最舊的
    const oldest = await prisma.seatingSnapshot.findFirst({ where: { eventId }, orderBy: { createdAt: 'asc' } })
    if (oldest) {
      await prisma.seatingSnapshot.delete({ where: { id: oldest.id } })
    }
  }

  const snapshot = await prisma.seatingSnapshot.create({
    data: {
      eventId,
      name: body.name,
      data: body.data,
      averageSatisfaction: body.averageSatisfaction,
    },
  })

  return c.json(snapshot, 201)
})

export { events }
