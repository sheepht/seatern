/**
 * Events API route tests
 *
 * 使用 Hono app.request() 測試 HTTP 層。
 * Prisma 透過 vi.mock 攔截，不需真實 DB。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock prisma before importing routes
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
    },
    subcategory: {
      findFirst: vi.fn(),
      create: vi.fn(),
      deleteMany: vi.fn(),
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

// Mock auth-utils to skip JWT verification
vi.mock('../lib/auth-utils', () => ({
  verifyToken: vi.fn(),
  ensureUser: vi.fn(),
}));

import { Hono } from 'hono';
import { prisma } from '@seatern/db';
import { events } from '../routes/events';
import type { SessionEnv } from '../middleware/session';

// Build test app with fake session middleware
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

describe('GET /events/mine', () => {
  it('有活動 → 跑 CTE 回傳活動資料', async () => {
    const app = buildApp();
    vi.mocked(prisma.event.findFirst).mockResolvedValue({ id: mockEvent.id } as never);
    // $queryRawUnsafe 回傳 CTE 結果
    vi.mocked(prisma.$queryRawUnsafe).mockResolvedValue([{
      ...mockEvent,
      _guests: JSON.stringify([]),
      _tables: JSON.stringify([]),
      _subcategories: JSON.stringify([]),
      _edges: JSON.stringify([]),
      _avoidPairs: JSON.stringify([]),
      _snapshots: JSON.stringify([]),
    }]);

    const res = await app.request('/events/mine');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.name).toBe('我的排位');
  });

  it('沒有活動 → 404', async () => {
    const app = buildApp();
    vi.mocked(prisma.event.findFirst).mockResolvedValue(null);

    const res = await app.request('/events/mine');
    expect(res.status).toBe(404);
  });
});

describe('POST /events', () => {
  it('建立新活動', async () => {
    const app = buildApp();
    vi.mocked(prisma.event.create).mockResolvedValue(mockEvent as never);

    const res = await app.request('/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: '測試活動' }),
    });
    expect(res.status).toBe(201);
    expect(prisma.event.create).toHaveBeenCalled();
  });
});

describe('POST /events/:id/guests/batch', () => {
  it('批次建立賓客', async () => {
    const app = buildApp();
    vi.mocked(prisma.event.findFirst).mockResolvedValue(mockEvent as never);
    const createdGuests = [
      { id: 'g1', name: '周杰倫' },
      { id: 'g2', name: '蕭敬騰' },
    ];
    vi.mocked(prisma.$transaction).mockResolvedValue(createdGuests);

    const res = await app.request('/events/evt-1/guests/batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        guests: [
          { name: '周杰倫', category: '男方' },
          { name: '蕭敬騰', category: '男方' },
        ],
      }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.count).toBe(2);
    expect(body.guests).toHaveLength(2);
  });
});

describe('POST /events/:id/tables', () => {
  it('建立桌次', async () => {
    const app = buildApp();
    const event = { ...mockEvent };
    vi.mocked(prisma.event.findFirst).mockResolvedValue(event as never);
    vi.mocked(prisma.table.count).mockResolvedValue(0);
    vi.mocked(prisma.table.create).mockResolvedValue({
      id: 't1', eventId: 'evt-1', name: '第1桌', capacity: 10,
      positionX: 200, positionY: 200, createdAt: new Date(), updatedAt: new Date(),
    } as never);

    const res = await app.request('/events/evt-1/tables', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: '第1桌', capacity: 10, positionX: 200, positionY: 200 }),
    });
    expect(res.status).toBe(201);
  });

  it('超過桌數上限 → 403 TABLE_LIMIT_REACHED', async () => {
    const app = buildApp();
    vi.mocked(prisma.event.findFirst).mockResolvedValue(mockEvent as never);
    vi.mocked(prisma.table.count).mockResolvedValue(10); // 已達上限

    const res = await app.request('/events/evt-1/tables', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: '第11桌' }),
    });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.code).toBe('TABLE_LIMIT_REACHED');
  });
});

describe('DELETE /events/:id/reset', () => {
  it('清空活動資料', async () => {
    const app = buildApp();
    vi.mocked(prisma.event.findFirst).mockResolvedValue(mockEvent as never);
    vi.mocked(prisma.$transaction).mockResolvedValue(undefined);

    const res = await app.request('/events/evt-1/reset', { method: 'DELETE' });
    expect(res.status).toBe(200);
  });
});
