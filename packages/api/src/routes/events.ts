import { Hono } from 'hono';
import { prisma } from '@seatern/db';
import type { OwnerType, Prisma } from '@prisma/client';
import type { SessionEnv } from '../middleware/session';
import type { CreateGuestPayload, CreateTablePayload, AssignSeatsBatchPayload, PreferenceBatchPayload, AvoidPairBatchPayload, SubcategoryBatchPayload } from '@seatern/shared';

const events = new Hono<SessionEnv>();

// ─── 方案桌數對照表 ─────────────────────────────────
//
//   planType   桌數上限   有效期
//   ─────────  ────────  ──────
//   null       10 / 20   無限
//   "30"       30        30 天
//   "50"       50        30 天
//   "80"       80        60 天
//   "200"      200       90 天
//
const PLAN_TABLE_LIMITS: Record<string, number> = {
  '30': 30,
  '50': 50,
  '80': 80,
  '200': 200,
};

/** 根據 Event 的方案狀態回傳桌數上限 */
function getTableLimit(event: { planType: string | null; planExpiresAt: Date | null; planStatus: string | null; ownerType: string }): number {
  if (!event.planType || !event.planExpiresAt || event.planStatus !== 'active') {
    return event.ownerType === 'anonymous' ? 10 : 20;
  }
  if (new Date() > event.planExpiresAt) {
    return event.ownerType === 'anonymous' ? 10 : 20;
  }
  return PLAN_TABLE_LIMITS[event.planType] ?? 20;
}

/** 檢查 Event 方案是否到期（到期 → 拒絕寫入操作） */
function isEventExpired(event: { planType: string | null; planExpiresAt: Date | null; planStatus: string | null }): boolean {
  if (!event.planType || !event.planExpiresAt || event.planStatus !== 'active') return false;
  return new Date() > event.planExpiresAt;
}

/** Dev 模式下放寬 owner 檢查：先用 owner 查，找不到就用 ID 查 */
async function findEventWithDevFallback(
  eventId: string,
  ownerId: string,
  ownerType: string,
) {
  const event = await prisma.event.findFirst({
    where: { id: eventId, ownerId, ownerType: ownerType as OwnerType },
  });
  if (event) return event;

  if (process.env.NODE_ENV !== 'production') {
    return prisma.event.findUnique({ where: { id: eventId } });
  }
  return null;
}

/** 寫入操作的到期 guard — 方案到期時拒絕修改 */
function expiredResponse(event: { planType: string | null; planExpiresAt: Date | null; planStatus: string | null }) {
  if (isEventExpired(event)) {
    return { code: 'PLAN_EXPIRED' as const, message: '方案已到期，請續費' };
  }
  return null;
}

// GET /events — 列出當前用戶的所有活動
events.get('/', async (c) => {
  const ownerId = c.get('ownerId');
  const ownerType = c.get('ownerType');

  const list = await prisma.event.findMany({
    where: { ownerId, ownerType },
    orderBy: { updatedAt: 'desc' },
  });
  return c.json(list);
});

// GET /events/mine — 取得當前 session 的唯一活動（含賓客、桌次等）
events.get('/mine', async (c) => {
  const ownerId = c.get('ownerId');
  const ownerType = c.get('ownerType');

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
  };

  const event = await prisma.event.findFirst({
    where: { ownerId, ownerType },
    include,
    orderBy: { updatedAt: 'desc' },
  });

  if (!event) return c.json({ error: 'No event found' }, 404);
  return c.json({ ...event, tableLimit: getTableLimit(event) });
});

// GET /events/:id — 取得單一活動（含賓客、桌次、標籤）
events.get('/:id', async (c) => {
  const ownerId = c.get('ownerId');
  const ownerType = c.get('ownerType');
  const id = c.req.param('id');

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
  };

  // 先用 owner 過濾，dev 模式 fallback 到 ID 查
  const eventBase = await findEventWithDevFallback(id, ownerId, ownerType);
  const event = eventBase
    ? await prisma.event.findUnique({ where: { id: eventBase.id }, include })
    : null;

  if (!event) return c.json({ error: 'Event not found' }, 404);
  return c.json({ ...event, tableLimit: getTableLimit(event) });
});

// POST /events — 建立新活動（同一 owner 已有活動時直接回傳，防重複建立）
events.post('/', async (c) => {
  const ownerId = c.get('ownerId');
  const ownerType = c.get('ownerType');
  const body = await c.req.json<{ name: string; date?: string; categories?: string[] }>();

  // 先查是否已有活動，防 race condition 產生重複
  const existing = await prisma.event.findFirst({
    where: { ownerId, ownerType },
    orderBy: { updatedAt: 'desc' },
  });
  if (existing) return c.json(existing, 200);

  const event = await prisma.event.create({
    data: {
      name: body.name,
      date: body.date,
      categories: body.categories || ['男方', '女方', '共同'],
      ownerId,
      ownerType,
    },
  });
  return c.json(event, 201);
});

// ─── 賓客 CRUD ──────────────────────────────────────

// POST /events/:id/guests — 批次建立賓客（匯入用）
events.post('/:id/guests/batch', async (c) => {
  const ownerId = c.get('ownerId');
  const ownerType = c.get('ownerType');
  const eventId = c.req.param('id');

  // 驗證活動歸屬
  const event = await findEventWithDevFallback(eventId, ownerId, ownerType);
  if (!event) return c.json({ error: 'Event not found' }, 404);
  const expired = expiredResponse(event);
  if (expired) return c.json(expired, 403);

  const body = await c.req.json<{ guests: CreateGuestPayload[] }>();

  const created = await prisma.$transaction(
    body.guests.map((g) =>
      prisma.guest.create({
        data: {
          eventId,
          name: g.name,
          aliases: g.aliases || [],
          category: g.category,
          rsvpStatus: (g.rsvpStatus === 'confirmed' || g.rsvpStatus === 'declined') ? g.rsvpStatus : 'confirmed',
          companionCount: g.companionCount ?? 0,
          dietaryNote: g.dietaryNote,
          specialNote: g.specialNote,
        },
      })
    )
  );

  return c.json({ count: created.length, guests: created }, 201);
});

// PATCH /events/:eventId — 更新活動（名稱等）
events.patch('/:eventId', async (c) => {
  const ownerId = c.get('ownerId');
  const ownerType = c.get('ownerType');
  const { eventId } = c.req.param();

  const event = await findEventWithDevFallback(eventId, ownerId, ownerType);
  if (!event) return c.json({ error: 'Event not found' }, 404);
  const expired = expiredResponse(event);
  if (expired) return c.json(expired, 403);

  const body = await c.req.json<{ name?: string }>();
  const updated = await prisma.event.update({
    where: { id: eventId },
    data: { ...(body.name !== undefined && { name: body.name }) },
  });
  return c.json(updated);
});

// PATCH /events/:eventId/guests/assign-batch — 批次更新賓客桌次分配（自動分配用）
events.patch('/:eventId/guests/assign-batch', async (c) => {
  const ownerId = c.get('ownerId');
  const ownerType = c.get('ownerType');
  const { eventId } = c.req.param();

  const event = await findEventWithDevFallback(eventId, ownerId, ownerType);
  if (!event) return c.json({ error: 'Event not found' }, 404);
  const expired = expiredResponse(event);
  if (expired) return c.json(expired, 403);

  const body = await c.req.json<AssignSeatsBatchPayload>();

  // 正規化：空字串視為 null
  const normalized = body.assignments.map((a) => ({
    ...a,
    tableId: a.tableId || null,
  }));

  // 驗證所有非 null 的 tableId 都存在
  const tableIds = [...new Set(normalized.filter((a) => a.tableId).map((a) => a.tableId!))];
  if (tableIds.length > 0) {
    const existingTables = await prisma.table.findMany({
      where: { id: { in: tableIds }, eventId },
      select: { id: true },
    });
    const existingIds = new Set(existingTables.map((t) => t.id));
    const missing = tableIds.filter((id) => !existingIds.has(id));
    if (missing.length > 0) {
      return c.json({ error: `Tables not found: ${missing.join(', ')}` }, 400);
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
  );

  return c.json({ count: normalized.length });
});

// PATCH /events/:eventId/guests/:guestId/table — 移動賓客到桌次
events.patch('/:eventId/guests/:guestId/table', async (c) => {
  const ownerId = c.get('ownerId');
  const ownerType = c.get('ownerType');
  const { eventId, guestId } = c.req.param();

  const event = await findEventWithDevFallback(eventId, ownerId, ownerType);
  if (!event) return c.json({ error: 'Event not found' }, 404);
  const expired = expiredResponse(event);
  if (expired) return c.json(expired, 403);

  const body = await c.req.json<{ tableId: string | null; seatIndex?: number | null }>();

  const guest = await prisma.guest.update({
    where: { id: guestId },
    data: {
      assignedTableId: body.tableId,
      seatIndex: body.tableId === null ? null : (body.seatIndex ?? null),
    },
  });

  return c.json(guest);
});

// POST /events/:eventId/guests — 新增單筆賓客
events.post('/:eventId/guests', async (c) => {
  const ownerId = c.get('ownerId');
  const ownerType = c.get('ownerType');
  const { eventId } = c.req.param();

  const event = await findEventWithDevFallback(eventId, ownerId, ownerType);
  if (!event) return c.json({ error: 'Event not found' }, 404);
  const expired = expiredResponse(event);
  if (expired) return c.json(expired, 403);

  const body = await c.req.json<CreateGuestPayload>();

  if (!body.name?.trim()) return c.json({ error: 'Name is required' }, 400);

  const guest = await prisma.guest.create({
    data: {
      eventId,
      name: body.name.trim(),
      aliases: body.aliases || [],
      category: body.category,
      rsvpStatus: (body.rsvpStatus === 'confirmed' || body.rsvpStatus === 'declined') ? body.rsvpStatus : 'confirmed',
      companionCount: body.companionCount ?? 0,
      dietaryNote: body.dietaryNote,
      specialNote: body.specialNote,
    },
    include: {
      seatPreferences: true,
      subcategory: true,
    },
  });

  return c.json(guest, 201);
});

// PATCH /events/:eventId/guests/:guestId — 更新單筆賓客（partial update, whitelist）
const GUEST_UPDATABLE_FIELDS = [
  'name', 'aliases', 'category', 'subcategoryId',
  'rsvpStatus', 'companionCount', 'dietaryNote', 'specialNote',
] as const;

events.patch('/:eventId/guests/:guestId', async (c) => {
  const ownerId = c.get('ownerId');
  const ownerType = c.get('ownerType');
  const { eventId, guestId } = c.req.param();

  const event = await findEventWithDevFallback(eventId, ownerId, ownerType);
  if (!event) return c.json({ error: 'Event not found' }, 404);
  const expired = expiredResponse(event);
  if (expired) return c.json(expired, 403);

  const body = await c.req.json<Record<string, unknown>>();

  // Whitelist: only allow known fields
  const data: Record<string, unknown> = {};
  for (const field of GUEST_UPDATABLE_FIELDS) {
    if (field in body) data[field] = body[field];
  }

  if (Object.keys(data).length === 0) return c.json({ error: 'No updatable fields provided' }, 400);

  // Validate name if provided
  if ('name' in data && !(data.name as string)?.trim()) return c.json({ error: 'Name cannot be empty' }, 400);
  if ('name' in data) data.name = (data.name as string).trim();

  try {
    const guest = await prisma.guest.update({
      where: { id: guestId },
      data,
      include: {
        seatPreferences: true,
        subcategory: true,
      },
    });
    return c.json(guest);
  } catch (e: unknown) {
    if (e instanceof Error && 'code' in e && (e as { code: string }).code === 'P2025') return c.json({ error: 'Guest not found' }, 404);
    throw e;
  }
});

// DELETE /events/:eventId/guests/:guestId — 刪除賓客（cascade: seatPrefs, avoidPairs, edges）
events.delete('/:eventId/guests/:guestId', async (c) => {
  const ownerId = c.get('ownerId');
  const ownerType = c.get('ownerType');
  const { eventId, guestId } = c.req.param();

  const event = await findEventWithDevFallback(eventId, ownerId, ownerType);
  if (!event) return c.json({ error: 'Event not found' }, 404);
  const expired = expiredResponse(event);
  if (expired) return c.json(expired, 403);

  try {
    await prisma.guest.delete({ where: { id: guestId } });
    return c.json({ ok: true });
  } catch (e: unknown) {
    if (e instanceof Error && 'code' in e && (e as { code: string }).code === 'P2025') return c.json({ error: 'Guest not found' }, 404);
    throw e;
  }
});

// ─── 桌次 CRUD ──────────────────────────────────────

// POST /events/:id/tables — 建立桌次
events.post('/:id/tables', async (c) => {
  const ownerId = c.get('ownerId');
  const ownerType = c.get('ownerType');
  const eventId = c.req.param('id');

  const event = await findEventWithDevFallback(eventId, ownerId, ownerType);
  if (!event) return c.json({ error: 'Event not found' }, 404);
  const expired = expiredResponse(event);
  if (expired) return c.json(expired, 403);

  // 動態桌數限制：根據 Event 方案決定上限
  const tableLimit = getTableLimit(event);
  const tableCount = await prisma.table.count({ where: { eventId } });
  if (tableCount >= tableLimit) {
    return c.json({ code: 'TABLE_LIMIT_REACHED', limit: tableLimit }, 403);
  }

  // 方案到期 → 拒絕寫入
  if (isEventExpired(event)) {
    return c.json({ code: 'PLAN_EXPIRED', message: '方案已到期，請續費' }, 403);
  }

  const body = await c.req.json<CreateTablePayload & { id?: string }>();

  const table = await prisma.table.create({
    data: {
      ...(body.id && { id: body.id }),
      eventId,
      name: body.name,
      capacity: body.capacity ?? 10,
      positionX: body.positionX ?? 0,
      positionY: body.positionY ?? 0,
    },
  });

  return c.json(table, 201);
});

// PATCH /events/:eventId/tables/:tableId — 更新桌次（位置、名稱等）
events.patch('/:eventId/tables/:tableId', async (c) => {
  const ownerId = c.get('ownerId');
  const ownerType = c.get('ownerType');
  const { eventId, tableId } = c.req.param();

  const event = await findEventWithDevFallback(eventId, ownerId, ownerType);
  if (!event) return c.json({ error: 'Event not found' }, 404);
  const expired = expiredResponse(event);
  if (expired) return c.json(expired, 403);

  const body = await c.req.json<{ name?: string; capacity?: number; positionX?: number; positionY?: number }>();

  const table = await prisma.table.update({
    where: { id: tableId },
    data: body,
  });

  return c.json(table);
});

// DELETE /events/:eventId/tables/empty — 批次刪除空桌（必須在 :tableId 之前）
events.delete('/:eventId/tables/empty', async (c) => {
  const ownerId = c.get('ownerId');
  const ownerType = c.get('ownerType');
  const { eventId } = c.req.param();

  const event = await findEventWithDevFallback(eventId, ownerId, ownerType);
  if (!event) return c.json({ error: 'Event not found' }, 404);
  const expired = expiredResponse(event);
  if (expired) return c.json(expired, 403);

  const allTables = await prisma.table.findMany({ where: { eventId } });
  const occupiedTableIds = await prisma.guest.groupBy({
    by: ['assignedTableId'],
    where: { eventId, assignedTableId: { not: null }, rsvpStatus: 'confirmed' },
  }).then(rows => rows.map(r => r.assignedTableId).filter(Boolean));

  const emptyTableIds = allTables
    .filter(t => !occupiedTableIds.includes(t.id))
    .map(t => t.id);

  if (emptyTableIds.length === 0) return c.json({ deleted: 0 });

  const result = await prisma.table.deleteMany({
    where: { id: { in: emptyTableIds } },
  });

  return c.json({ deleted: result.count });
});

// DELETE /events/:eventId/tables/:tableId — 刪除桌次（同時清除賓客分配）
events.delete('/:eventId/tables/:tableId', async (c) => {
  const ownerId = c.get('ownerId');
  const ownerType = c.get('ownerType');
  const { eventId, tableId } = c.req.param();

  const event = await findEventWithDevFallback(eventId, ownerId, ownerType);
  if (!event) return c.json({ error: 'Event not found' }, 404);
  const expired = expiredResponse(event);
  if (expired) return c.json(expired, 403);

  // 清除該桌所有賓客的分配
  await prisma.guest.updateMany({
    where: { eventId, assignedTableId: tableId },
    data: { assignedTableId: null, seatIndex: null },
  });

  await prisma.table.delete({ where: { id: tableId } });

  return c.json({ ok: true });
});

// DELETE /events/:eventId/reset — 清除活動所有資料（賓客、桌次、偏好、避桌、子分類、快照）
events.delete('/:eventId/reset', async (c) => {
  const ownerId = c.get('ownerId');
  const ownerType = c.get('ownerType');
  const { eventId } = c.req.param();

  const event = await findEventWithDevFallback(eventId, ownerId, ownerType);
  if (!event) return c.json({ error: 'Event not found' }, 404);
  const expired = expiredResponse(event);
  if (expired) return c.json(expired, 403);

  await prisma.$transaction([
    prisma.seatPreference.deleteMany({ where: { guest: { eventId } } }),
    prisma.avoidPair.deleteMany({ where: { eventId } }),
    prisma.edge.deleteMany({ where: { eventId } }),
    prisma.seatingSnapshot.deleteMany({ where: { eventId } }),
    prisma.guest.deleteMany({ where: { eventId } }),
    prisma.table.deleteMany({ where: { eventId } }),
    prisma.subcategory.deleteMany({ where: { eventId } }),
  ]);

  return c.json({ ok: true });
});

// ─── 座位偏好 ────────────────────────────────────────

// POST /events/:id/preferences/batch — 批次建立座位偏好
events.post('/:id/preferences/batch', async (c) => {
  const ownerId = c.get('ownerId');
  const ownerType = c.get('ownerType');
  const eventId = c.req.param('id');

  const event = await findEventWithDevFallback(eventId, ownerId, ownerType);
  if (!event) return c.json({ error: 'Event not found' }, 404);
  const expired = expiredResponse(event);
  if (expired) return c.json(expired, 403);

  const body = await c.req.json<PreferenceBatchPayload>();

  // 先清除該活動的所有舊偏好
  const guestIds = await prisma.guest.findMany({
    where: { eventId },
    select: { id: true },
  });
  const ids = guestIds.map((g) => g.id);
  await prisma.seatPreference.deleteMany({
    where: { guestId: { in: ids } },
  });

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
  );

  return c.json({ count: created.length }, 201);
});

// PUT /events/:eventId/guests/:guestId/preferences — 替換單一賓客的座位偏好
events.put('/:eventId/guests/:guestId/preferences', async (c) => {
  const ownerId = c.get('ownerId');
  const ownerType = c.get('ownerType');
  const { eventId, guestId } = c.req.param();

  const event = await findEventWithDevFallback(eventId, ownerId, ownerType);
  if (!event) return c.json({ error: 'Event not found' }, 404);
  const expired = expiredResponse(event);
  if (expired) return c.json(expired, 403);

  const body = await c.req.json<{
    preferences: Array<{ preferredGuestId: string; rank: number }>
  }>();

  if (body.preferences.length > 3) {
    return c.json({ error: 'Maximum 3 preferences allowed' }, 400);
  }

  // 刪除該賓客的舊偏好，再建立新的
  await prisma.seatPreference.deleteMany({ where: { guestId } });

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
  );

  return c.json(created);
});

// ─── 子分類 ─────────────────────────────────────────────

// POST /events/:id/subcategories/batch — 批次建立子分類並關聯賓客
events.post('/:id/subcategories/batch', async (c) => {
  const ownerId = c.get('ownerId');
  const ownerType = c.get('ownerType');
  const eventId = c.req.param('id');

  const event = await findEventWithDevFallback(eventId, ownerId, ownerType);
  if (!event) return c.json({ error: 'Event not found' }, 404);
  const expired = expiredResponse(event);
  if (expired) return c.json(expired, 403);

  const body = await c.req.json<SubcategoryBatchPayload>();

  // Upsert subcategories
  const subcatMap = new Map<string, string>();
  const uniqueNames = [...new Set(body.assignments.map((a) => a.subcategoryName))];
  for (const name of uniqueNames) {
    const category = body.assignments.find((a) => a.subcategoryName === name)!.category;
    const subcat = await prisma.subcategory.upsert({
      where: { eventId_name: { eventId, name } },
      create: { eventId, name, category },
      update: {},
    });
    subcatMap.set(name, subcat.id);
  }

  // Assign subcategory to guests
  let assigned = 0;
  for (const a of body.assignments) {
    const subcategoryId = subcatMap.get(a.subcategoryName);
    if (!subcategoryId) continue;
    await prisma.guest.update({
      where: { id: a.guestId },
      data: { subcategoryId },
    });
    assigned++;
  }

  return c.json({ subcategories: uniqueNames.length, assigned }, 201);
});

// ─── 避免同桌 ────────────────────────────────────────

// POST /events/:id/avoid-pairs/batch — 批次建立避免同桌
events.post('/:id/avoid-pairs/batch', async (c) => {
  const ownerId = c.get('ownerId');
  const ownerType = c.get('ownerType');
  const eventId = c.req.param('id');

  const event = await findEventWithDevFallback(eventId, ownerId, ownerType);
  if (!event) return c.json({ error: 'Event not found' }, 404);
  const expired = expiredResponse(event);
  if (expired) return c.json(expired, 403);

  const body = await c.req.json<AvoidPairBatchPayload>();

  let created = 0;
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
    });
    if (existing) continue;
    await prisma.avoidPair.create({
      data: { eventId, guestAId: p.guestAId, guestBId: p.guestBId, reason: p.reason },
    });
    created++;
  }

  return c.json({ count: created }, 201);
});

// POST /events/:id/avoid-pairs
events.post('/:id/avoid-pairs', async (c) => {
  const ownerId = c.get('ownerId');
  const ownerType = c.get('ownerType');
  const eventId = c.req.param('id');

  const event = await findEventWithDevFallback(eventId, ownerId, ownerType);
  if (!event) return c.json({ error: 'Event not found' }, 404);
  const expired = expiredResponse(event);
  if (expired) return c.json(expired, 403);

  const body = await c.req.json<{ guestAId: string; guestBId: string; reason?: string }>();

  const pair = await prisma.avoidPair.create({
    data: {
      eventId,
      guestAId: body.guestAId,
      guestBId: body.guestBId,
      reason: body.reason,
    },
  });

  return c.json(pair, 201);
});

// DELETE /events/:eventId/avoid-pairs/:pairId
events.delete('/:eventId/avoid-pairs/:pairId', async (c) => {
  const { pairId } = c.req.param();
  await prisma.avoidPair.delete({ where: { id: pairId } });
  return c.json({ ok: true });
});

// ─── 快照 ────────────────────────────────────────────

// POST /events/:id/snapshots
events.post('/:id/snapshots', async (c) => {
  const ownerId = c.get('ownerId');
  const ownerType = c.get('ownerType');
  const eventId = c.req.param('id');

  const event = await findEventWithDevFallback(eventId, ownerId, ownerType);
  if (!event) return c.json({ error: 'Event not found' }, 404);
  const expired = expiredResponse(event);
  if (expired) return c.json(expired, 403);

  const body = await c.req.json<{ name: string; data: Prisma.InputJsonValue; averageSatisfaction: number }>();

  // 免費版限制 1 份快照
  const existing = await prisma.seatingSnapshot.count({ where: { eventId } });
  if (existing >= 1) {
    // 覆蓋最舊的
    const oldest = await prisma.seatingSnapshot.findFirst({ where: { eventId }, orderBy: { createdAt: 'asc' } });
    if (oldest) {
      await prisma.seatingSnapshot.delete({ where: { id: oldest.id } });
    }
  }

  const snapshot = await prisma.seatingSnapshot.create({
    data: {
      eventId,
      name: body.name,
      data: body.data,
      averageSatisfaction: body.averageSatisfaction,
    },
  });

  return c.json(snapshot, 201);
});

// ─── 付費通知 ──────────────────────────────────────

// POST /events/:id/notify-payment — 通知已匯款
events.post('/:id/notify-payment', async (c) => {
  const ownerId = c.get('ownerId');
  const ownerType = c.get('ownerType');
  const eventId = c.req.param('id');

  if (ownerType === 'anonymous') {
    return c.json({ error: '請先登入再購買方案' }, 401);
  }

  const event = await findEventWithDevFallback(eventId, ownerId, ownerType);
  if (!event) return c.json({ error: 'Event not found' }, 404);

  // 已經在處理中或已啟用 → 冪等回應
  if (event.planStatus === 'pending' || event.planStatus === 'active') {
    return c.json({ status: event.planStatus, message: '已收到通知' });
  }

  const body = await c.req.json<{ planType: string }>();

  if (!PLAN_TABLE_LIMITS[body.planType]) {
    return c.json({ error: '無效的方案類型' }, 400);
  }

  await prisma.event.update({
    where: { id: eventId },
    data: {
      planType: body.planType,
      planStatus: 'pending',
      planCreatedAt: new Date(),
    },
  });

  // TODO: 發送通知給創辦人（email / LINE / push）
  console.log(`[PAYMENT] 用戶 ${ownerId} 通知已匯款，活動 ${eventId}，方案 ${body.planType} 桌`);

  return c.json({ status: 'pending', message: '已通知，我們會盡快確認' }, 200);
});

// POST /events/:id/approve-plan — 手動核准方案（創辦人用）
events.post('/:id/approve-plan', async (c) => {
  const eventId = c.req.param('id');

  const event = await prisma.event.findUnique({ where: { id: eventId } });
  if (!event) return c.json({ error: 'Event not found' }, 404);
  if (!event.planType) return c.json({ error: '此活動沒有待審方案' }, 400);

  // 有效期天數對照
  const PLAN_DAYS: Record<string, number> = { '30': 30, '50': 30, '80': 60, '200': 90 };
  const days = PLAN_DAYS[event.planType] ?? 30;
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + days);

  await prisma.event.update({
    where: { id: eventId },
    data: {
      planStatus: 'active',
      planExpiresAt: expiresAt,
    },
  });

  console.log(`[PAYMENT] 核准活動 ${eventId} 的 ${event.planType} 桌方案，到期 ${expiresAt.toISOString()}`);

  return c.json({ status: 'active', expiresAt: expiresAt.toISOString() });
});

export { events };
