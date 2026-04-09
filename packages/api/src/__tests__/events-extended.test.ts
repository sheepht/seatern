/**
 * Events route extended tests
 *
 * 補充 events.test.ts 未涵蓋的端點測試。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@seatern/db', () => ({
  prisma: {
    event: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    guest: {
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
      findMany: vi.fn(),
      groupBy: vi.fn(),
    },
    table: {
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
      count: vi.fn(),
      findMany: vi.fn(),
    },
    seatPreference: {
      deleteMany: vi.fn(),
      createMany: vi.fn(),
      create: vi.fn(),
    },
    subcategory: {
      findFirst: vi.fn(),
      create: vi.fn(),
      deleteMany: vi.fn(),
      upsert: vi.fn(),
    },
    avoidPair: {
      findFirst: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    },
    seatingSnapshot: {
      count: vi.fn(),
      create: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    },
    edge: { deleteMany: vi.fn() },
    $transaction: vi.fn().mockImplementation((input: unknown) =>
      Array.isArray(input) ? Promise.all(input) : Promise.resolve(input),
    ),
    $queryRawUnsafe: vi.fn().mockResolvedValue([]),
    $executeRawUnsafe: vi.fn().mockResolvedValue(0),
  },
}));

vi.mock('../lib/auth-utils', () => ({
  verifyToken: vi.fn(),
  ensureUser: vi.fn(),
}));

import { Hono } from 'hono';
import { prisma } from '@seatern/db';
import { events } from '../routes/events';
import type { SessionEnv } from '../middleware/session';

function buildApp(ownerId = 'test-owner', ownerType: 'user' | 'anonymous' = 'anonymous') {
  const app = new Hono<SessionEnv>();
  app.use('*', async (c, next) => {
    c.set('ownerId', ownerId);
    c.set('ownerType', ownerType);
    await next();
  });
  app.route('/events', events);
  return app;
}

const mockEvent = {
  id: 'evt-1',
  name: '我的排位',
  ownerId: 'test-owner',
  ownerType: 'anonymous',
  date: null,
  categories: ['男方', '女方', '共同'],
  planType: null,
  planStatus: null,
  planExpiresAt: null,
  planCreatedAt: null,
  planNote: null,
  tableLimit: 10,
  guests: [],
  tables: [],
  subcategories: [],
  avoidPairs: [],
  edges: [],
  snapshots: [],
  createdAt: new Date(),
  updatedAt: new Date(),
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('PATCH /events/:id', () => {
  it('更新活動名稱', async () => {
    const app = buildApp();
    vi.mocked(prisma.event.findFirst).mockResolvedValue(mockEvent as ReturnType<typeof prisma.event.findFirst> extends Promise<infer T> ? T : never);
    vi.mocked(prisma.event.update).mockResolvedValue({
      ...mockEvent,
      name: '新名稱',
    } as ReturnType<typeof prisma.event.update> extends Promise<infer T> ? T : never);

    const res = await app.request('/events/evt-1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: '新名稱' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.name).toBe('新名稱');
  });
});

describe('PATCH /events/:id/guests/:guestId/table', () => {
  it('移動賓客到桌次', async () => {
    const app = buildApp();
    vi.mocked(prisma.event.findFirst).mockResolvedValue(mockEvent as ReturnType<typeof prisma.event.findFirst> extends Promise<infer T> ? T : never);
    vi.mocked(prisma.guest.update).mockResolvedValue({
      id: 'g1',
      name: '賓客A',
      assignedTableId: 't1',
      seatIndex: null,
    } as ReturnType<typeof prisma.guest.update> extends Promise<infer T> ? T : never);

    const res = await app.request('/events/evt-1/guests/g1/table', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tableId: 't1' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.assignedTableId).toBe('t1');
  });
});

describe('POST /events/:id/preferences/batch', () => {
  it('批次建立座位偏好', async () => {
    const app = buildApp();
    vi.mocked(prisma.event.findFirst).mockResolvedValue(mockEvent as ReturnType<typeof prisma.event.findFirst> extends Promise<infer T> ? T : never);
    vi.mocked(prisma.guest.findMany).mockResolvedValue([
      { id: 'g1' },
      { id: 'g2' },
    ] as ReturnType<typeof prisma.guest.findMany> extends Promise<infer T> ? T : never);
    vi.mocked(prisma.seatPreference.deleteMany).mockResolvedValue({ count: 0 });

    const createdPrefs = [
      { id: 'sp1', guestId: 'g1', preferredGuestId: 'g2', rank: 1 },
    ];
    vi.mocked(prisma.$transaction).mockResolvedValue(createdPrefs);

    const res = await app.request('/events/evt-1/preferences/batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        preferences: [{ guestId: 'g1', preferredGuestId: 'g2', rank: 1 }],
      }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.count).toBe(1);
  });
});

describe('POST /events/:id/avoid-pairs/batch', () => {
  it('批次建立避免同桌（含去重檢查）', async () => {
    const app = buildApp();
    vi.mocked(prisma.event.findFirst).mockResolvedValue(mockEvent as ReturnType<typeof prisma.event.findFirst> extends Promise<infer T> ? T : never);
    // First pair: not existing → create
    vi.mocked(prisma.avoidPair.findFirst).mockResolvedValueOnce(null);
    vi.mocked(prisma.avoidPair.create).mockResolvedValue({
      id: 'ap1',
      eventId: 'evt-1',
      guestAId: 'g1',
      guestBId: 'g2',
      reason: '前任',
    } as ReturnType<typeof prisma.avoidPair.create> extends Promise<infer T> ? T : never);

    const res = await app.request('/events/evt-1/avoid-pairs/batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pairs: [{ guestAId: 'g1', guestBId: 'g2', reason: '前任' }],
      }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.count).toBe(1);
  });

  it('已存在的避免同桌對 → 不重複建立', async () => {
    const app = buildApp();
    vi.mocked(prisma.event.findFirst).mockResolvedValue(mockEvent as ReturnType<typeof prisma.event.findFirst> extends Promise<infer T> ? T : never);
    // Pair already exists
    vi.mocked(prisma.avoidPair.findFirst).mockResolvedValue({
      id: 'ap-existing',
    } as ReturnType<typeof prisma.avoidPair.findFirst> extends Promise<infer T> ? T : never);

    const res = await app.request('/events/evt-1/avoid-pairs/batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pairs: [{ guestAId: 'g1', guestBId: 'g2' }],
      }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.count).toBe(0);
    expect(prisma.avoidPair.create).not.toHaveBeenCalled();
  });
});

describe('DELETE /events/:id/tables/empty', () => {
  it('刪除空桌', async () => {
    const app = buildApp();
    vi.mocked(prisma.event.findFirst).mockResolvedValue(mockEvent as ReturnType<typeof prisma.event.findFirst> extends Promise<infer T> ? T : never);
    vi.mocked(prisma.table.findMany).mockResolvedValue([
      { id: 't1' },
      { id: 't2' },
      { id: 't3' },
    ] as ReturnType<typeof prisma.table.findMany> extends Promise<infer T> ? T : never);
    // t1 is occupied
    vi.mocked(prisma.guest.groupBy).mockResolvedValue([
      { assignedTableId: 't1' },
    ] as ReturnType<typeof prisma.guest.groupBy> extends Promise<infer T> ? T : never);
    vi.mocked(prisma.table.deleteMany).mockResolvedValue({ count: 2 });

    const res = await app.request('/events/evt-1/tables/empty', { method: 'DELETE' });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.deleted).toBe(2);
  });

  it('沒有空桌 → deleted: 0', async () => {
    const app = buildApp();
    vi.mocked(prisma.event.findFirst).mockResolvedValue(mockEvent as ReturnType<typeof prisma.event.findFirst> extends Promise<infer T> ? T : never);
    vi.mocked(prisma.table.findMany).mockResolvedValue([
      { id: 't1' },
    ] as ReturnType<typeof prisma.table.findMany> extends Promise<infer T> ? T : never);
    vi.mocked(prisma.guest.groupBy).mockResolvedValue([
      { assignedTableId: 't1' },
    ] as ReturnType<typeof prisma.guest.groupBy> extends Promise<infer T> ? T : never);

    const res = await app.request('/events/evt-1/tables/empty', { method: 'DELETE' });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.deleted).toBe(0);
  });
});

describe('POST /events/:id/snapshots', () => {
  it('儲存座位快照', async () => {
    const app = buildApp();
    vi.mocked(prisma.event.findFirst).mockResolvedValue(mockEvent as ReturnType<typeof prisma.event.findFirst> extends Promise<infer T> ? T : never);
    vi.mocked(prisma.seatingSnapshot.count).mockResolvedValue(0);
    vi.mocked(prisma.seatingSnapshot.create).mockResolvedValue({
      id: 'snap-1',
      eventId: 'evt-1',
      name: '快照1',
      data: { guests: [], tables: [] },
      averageSatisfaction: 78.5,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as ReturnType<typeof prisma.seatingSnapshot.create> extends Promise<infer T> ? T : never);

    const res = await app.request('/events/evt-1/snapshots', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: '快照1',
        data: { guests: [], tables: [] },
        averageSatisfaction: 78.5,
      }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.name).toBe('快照1');
  });

  it('超過快照上限 → 覆蓋最舊的', async () => {
    const app = buildApp();
    vi.mocked(prisma.event.findFirst).mockResolvedValue(mockEvent as ReturnType<typeof prisma.event.findFirst> extends Promise<infer T> ? T : never);
    vi.mocked(prisma.seatingSnapshot.count).mockResolvedValue(1);
    vi.mocked(prisma.seatingSnapshot.findFirst).mockResolvedValue({
      id: 'snap-old',
    } as ReturnType<typeof prisma.seatingSnapshot.findFirst> extends Promise<infer T> ? T : never);
    vi.mocked(prisma.seatingSnapshot.delete).mockResolvedValue({} as ReturnType<typeof prisma.seatingSnapshot.delete> extends Promise<infer T> ? T : never);
    vi.mocked(prisma.seatingSnapshot.create).mockResolvedValue({
      id: 'snap-new',
      eventId: 'evt-1',
      name: '新快照',
      data: { guests: [], tables: [] },
      averageSatisfaction: 80,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as ReturnType<typeof prisma.seatingSnapshot.create> extends Promise<infer T> ? T : never);

    const res = await app.request('/events/evt-1/snapshots', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: '新快照',
        data: { guests: [], tables: [] },
        averageSatisfaction: 80,
      }),
    });
    expect(res.status).toBe(201);
    expect(prisma.seatingSnapshot.delete).toHaveBeenCalledWith({ where: { id: 'snap-old' } });
  });
});
