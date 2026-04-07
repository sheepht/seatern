/**
 * Admin route tests
 *
 * 測試 /admin 路由的登入、待審列表、核准、修改等功能。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@seatern/db', () => ({
  prisma: {
    event: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
    },
  },
}));

import { Hono } from 'hono';
import { prisma } from '@seatern/db';
import { admin } from '../routes/admin';

function buildApp() {
  const app = new Hono();
  app.route('/admin', admin);
  return app;
}

const ADMIN_SECRET = 'test-secret';
const validToken = Buffer.from(ADMIN_SECRET).toString('base64');

beforeEach(() => {
  vi.clearAllMocks();
  process.env.ADMIN_SECRET = ADMIN_SECRET;
});

describe('POST /admin/login', () => {
  it('正確密碼 → 200 帶 token', async () => {
    const app = buildApp();
    const res = await app.request('/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: ADMIN_SECRET }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.token).toBe(validToken);
  });

  it('錯誤密碼 → 401', async () => {
    const app = buildApp();
    const res = await app.request('/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'wrong-password' }),
    });
    expect(res.status).toBe(401);
  });
});

describe('GET /admin/pending-plans', () => {
  it('無 auth → 401', async () => {
    const app = buildApp();
    const res = await app.request('/admin/pending-plans');
    expect(res.status).toBe(401);
  });

  it('有效 auth → 回傳待審列表', async () => {
    const app = buildApp();
    vi.mocked(prisma.event.findMany).mockResolvedValue([
      {
        id: 'evt-1',
        name: '測試活動',
        ownerId: 'user-1',
        ownerType: 'user',
        planType: '30',
        planStatus: 'pending',
        planNote: '已匯款',
        planCreatedAt: new Date(),
        updatedAt: new Date(),
        _count: { guests: 5, tables: 2 },
      },
    ] as unknown as ReturnType<typeof prisma.event.findMany> extends Promise<infer T> ? T : never);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      name: 'Test User',
      email: 'test@test.com',
    } as ReturnType<typeof prisma.user.findUnique> extends Promise<infer T> ? T : never);

    const res = await app.request('/admin/pending-plans', {
      headers: { Authorization: `Bearer ${validToken}` },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(body[0].ownerName).toBe('Test User');
    expect(body[0].guestCount).toBe(5);
  });
});

describe('POST /admin/approve/:eventId', () => {
  it('核准方案 → 更新 planStatus 為 active', async () => {
    const app = buildApp();
    vi.mocked(prisma.event.findUnique).mockResolvedValue({
      id: 'evt-1',
      planType: '30',
      planStatus: 'pending',
    } as ReturnType<typeof prisma.event.findUnique> extends Promise<infer T> ? T : never);
    vi.mocked(prisma.event.update).mockResolvedValue({} as ReturnType<typeof prisma.event.update> extends Promise<infer T> ? T : never);

    const res = await app.request('/admin/approve/evt-1', {
      method: 'POST',
      headers: { Authorization: `Bearer ${validToken}` },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('active');
    expect(body.expiresAt).toBeDefined();
    expect(prisma.event.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'evt-1' },
        data: expect.objectContaining({ planStatus: 'active' }),
      }),
    );
  });
});

describe('PATCH /admin/events/:eventId', () => {
  it('修改方案欄位', async () => {
    const app = buildApp();
    vi.mocked(prisma.event.findUnique).mockResolvedValue({
      id: 'evt-1',
      planType: '30',
    } as ReturnType<typeof prisma.event.findUnique> extends Promise<infer T> ? T : never);
    vi.mocked(prisma.event.update).mockResolvedValue({
      planType: '50',
      planStatus: 'active',
      planExpiresAt: null,
    } as unknown as ReturnType<typeof prisma.event.update> extends Promise<infer T> ? T : never);

    const res = await app.request('/admin/events/evt-1', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${validToken}`,
      },
      body: JSON.stringify({ planType: '50', planStatus: 'active' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  it('活動不存在 → 404', async () => {
    const app = buildApp();
    vi.mocked(prisma.event.findUnique).mockResolvedValue(null);

    const res = await app.request('/admin/events/nonexistent', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${validToken}`,
      },
      body: JSON.stringify({ planType: '50' }),
    });
    expect(res.status).toBe(404);
  });
});
