import { Hono } from 'hono'
import { prisma } from '@seatern/db'
import type { SessionEnv } from '../middleware/session'

const events = new Hono<SessionEnv>()

/** Dev 模式下放寬 owner 檢查：先用 owner 查，找不到就用 ID 查 */
async function findEventWithDevFallback(
  eventId: string,
  ownerId: string,
  ownerType: string,
) {
  const event = await prisma.event.findFirst({
    where: { id: eventId, ownerId, ownerType },
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

// GET /events/:id — 取得單一活動（含賓客、桌次、標籤）
events.get('/:id', async (c) => {
  const ownerId = c.get('ownerId')
  const ownerType = c.get('ownerType')
  const id = c.req.param('id')

  const include = {
    guests: {
      include: {
        seatPreferences: true,
        guestTags: { include: { tag: true } },
      },
      orderBy: { name: 'asc' } as const,
    },
    tables: { orderBy: { name: 'asc' } as const },
    tags: { orderBy: { name: 'asc' } as const },
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
      relationScore?: number
      rsvpStatus?: string
      attendeeCount?: number
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
          relationScore: g.relationScore ?? 2,
          rsvpStatus: (g.rsvpStatus as any) || 'confirmed',
          attendeeCount: g.attendeeCount ?? 1,
          dietaryNote: g.dietaryNote,
          specialNote: g.specialNote,
        },
      })
    )
  )

  return c.json({ count: created.length, guests: created }, 201)
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

// ─── 桌次 CRUD ──────────────────────────────────────

// POST /events/:id/tables — 建立桌次
events.post('/:id/tables', async (c) => {
  const ownerId = c.get('ownerId')
  const ownerType = c.get('ownerType')
  const eventId = c.req.param('id')

  const event = await findEventWithDevFallback(eventId, ownerId, ownerType)
  if (!event) return c.json({ error: 'Event not found' }, 404)

  const body = await c.req.json<{ name: string; capacity?: number; positionX?: number; positionY?: number }>()

  const table = await prisma.table.create({
    data: {
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

// ─── 避免同桌 ────────────────────────────────────────

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
