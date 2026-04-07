/**
 * Users route tests
 *
 * 測試 /users 路由的個人資料更新、刪除、匯出功能。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@seatern/db', () => ({
  prisma: {
    user: {
      update: vi.fn(),
      findUnique: vi.fn(),
    },
    event: {
      findFirst: vi.fn(),
    },
  },
}));

vi.mock('../lib/auth-utils', () => ({
  verifyToken: vi.fn(),
  ensureUser: vi.fn(),
}));

import { Hono } from 'hono';
import { prisma } from '@seatern/db';
import { users } from '../routes/users';
import type { AuthEnv } from '../middleware/auth';

function buildApp(userId = 'test-user-id') {
  const app = new Hono<AuthEnv>();
  app.use('*', async (c, next) => {
    c.set('userId', userId);
    await next();
  });
  app.route('/users', users);
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('PATCH /users/me', () => {
  it('有效名稱 → 更新並回傳 user', async () => {
    const app = buildApp();
    vi.mocked(prisma.user.update).mockResolvedValue({
      id: 'test-user-id',
      name: '新名字',
      email: 'test@test.com',
      avatarUrl: null,
    } as ReturnType<typeof prisma.user.update> extends Promise<infer T> ? T : never);

    const res = await app.request('/users/me', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: '新名字' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.user.name).toBe('新名字');
  });

  it('空名稱 → 400', async () => {
    const app = buildApp();
    const res = await app.request('/users/me', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: '  ' }),
    });
    expect(res.status).toBe(400);
  });

  it('名稱超過 100 字 → 400', async () => {
    const app = buildApp();
    const res = await app.request('/users/me', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'a'.repeat(101) }),
    });
    expect(res.status).toBe(400);
  });
});

describe('DELETE /users/me', () => {
  it('軟刪除使用者 (設定 deletedAt)', async () => {
    const app = buildApp();
    vi.mocked(prisma.user.update).mockResolvedValue({} as ReturnType<typeof prisma.user.update> extends Promise<infer T> ? T : never);

    const res = await app.request('/users/me', { method: 'DELETE' });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.message).toContain('刪除');
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'test-user-id' },
        data: expect.objectContaining({ deletedAt: expect.any(Date) }),
      }),
    );
  });
});

describe('GET /users/me/export', () => {
  it('回傳結構化匯出資料', async () => {
    const app = buildApp();
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      name: 'Test User',
      email: 'test@test.com',
    } as ReturnType<typeof prisma.user.findUnique> extends Promise<infer T> ? T : never);
    vi.mocked(prisma.event.findFirst).mockResolvedValue({
      name: '我的婚禮',
      date: '2026-06-01',
      categories: ['男方', '女方'],
      guests: [
        {
          name: '賓客A',
          aliases: [],
          category: '男方',
          subcategory: { name: '大學同學', category: '男方' },
          rsvpStatus: 'confirmed',
          companionCount: 0,
          dietaryNote: null,
          specialNote: null,
          seatPreferences: [],
        },
      ],
      tables: [{ name: '第1桌', capacity: 10, positionX: 0, positionY: 0, color: null, note: null }],
      subcategories: [{ name: '大學同學', category: '男方' }],
      avoidPairs: [],
    } as unknown as ReturnType<typeof prisma.event.findFirst> extends Promise<infer T> ? T : never);

    const res = await app.request('/users/me/export');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.user.name).toBe('Test User');
    expect(body.event.name).toBe('我的婚禮');
    expect(body.guests).toHaveLength(1);
    expect(body.tables).toHaveLength(1);
  });

  it('使用者不存在 → 404', async () => {
    const app = buildApp();
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);

    const res = await app.request('/users/me/export');
    expect(res.status).toBe(404);
  });
});
