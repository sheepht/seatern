/**
 * Auth routes tests (routes/auth.ts)
 *
 * LINE OAuth、LINE link/unlink、claim-event
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock prisma
vi.mock('@seatern/db', () => ({
  prisma: {
    event: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
  },
}));

// Mock supabase admin
vi.mock('../lib/supabase-admin', () => ({
  supabaseAdmin: {
    auth: {
      admin: {
        createUser: vi.fn(),
        listUsers: vi.fn(),
        updateUserById: vi.fn(),
        generateLink: vi.fn(),
      },
    },
  },
}));

// Mock auth-utils
vi.mock('../lib/auth-utils', () => ({
  verifyToken: vi.fn(),
  ensureUser: vi.fn(),
}));

import { Hono } from 'hono';
import { prisma } from '@seatern/db';
import { supabaseAdmin } from '../lib/supabase-admin';
import { auth } from '../routes/auth';
import type { SessionEnv } from '../middleware/session';

function buildApp(ownerId = 'anon-session-123', ownerType: 'user' | 'anonymous' = 'anonymous') {
  const app = new Hono<SessionEnv>();
  app.use('*', async (c, next) => {
    c.set('ownerId', ownerId);
    c.set('ownerType', ownerType);
    await next();
  });
  app.route('/auth', auth);
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.LINE_CHANNEL_ID = 'test-channel-id';
  process.env.LINE_CHANNEL_SECRET = 'test-secret';
  process.env.LINE_CALLBACK_URL = 'http://localhost:3001/api/auth/line/callback';
  process.env.VITE_FRONTEND_URL = 'http://localhost:5173';
});

// ─── LINE OAuth Redirect ───

describe('GET /auth/line', () => {
  it('redirect 到 LINE 授權頁', async () => {
    const app = buildApp();
    const res = await app.request('/auth/line');
    expect(res.status).toBe(302);
    const location = res.headers.get('Location')!;
    expect(location).toContain('access.line.me/oauth2/v2.1/authorize');
    expect(location).toContain('client_id=test-channel-id');
  });

  it('LINE 未設定 → 500', async () => {
    delete process.env.LINE_CHANNEL_ID;
    const app = buildApp();
    const res = await app.request('/auth/line');
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toContain('not configured');
  });
});

describe('GET /auth/line/callback', () => {
  it('LINE 授權取消 → redirect 帶 error', async () => {
    const app = buildApp();
    const res = await app.request('/auth/line/callback?error=access_denied');
    expect(res.status).toBe(302);
    expect(res.headers.get('Location')).toContain('error=');
  });

  it('無 code → redirect 帶 error', async () => {
    const app = buildApp();
    const res = await app.request('/auth/line/callback?state=abc');
    expect(res.status).toBe(302);
    expect(res.headers.get('Location')).toContain('error=');
  });

  it('state 不匹配 → redirect 帶 error', async () => {
    const app = buildApp();
    const res = await app.request('/auth/line/callback?code=abc&state=wrong');
    expect(res.status).toBe(302);
    expect(res.headers.get('Location')).toContain('error=');
  });
});

// ─── LINE Link ───

describe('GET /auth/line/link', () => {
  it('無 auth header → 401', async () => {
    const app = buildApp();
    const res = await app.request('/auth/line/link');
    expect(res.status).toBe(401);
  });

  it('dev-bypass → 回傳 LINE OAuth URL', async () => {
    const app = buildApp();
    const res = await app.request('/auth/line/link', {
      headers: { Authorization: 'Bearer dev-bypass-user123' },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.url).toContain('access.line.me');
    expect(body.url).toContain('client_id=test-channel-id');
  });

  it('LINE 未設定 → 500', async () => {
    delete process.env.LINE_CHANNEL_ID;
    const app = buildApp();
    const res = await app.request('/auth/line/link', {
      headers: { Authorization: 'Bearer dev-bypass-user123' },
    });
    expect(res.status).toBe(500);
  });
});

// ─── LINE Unlink ───

describe('POST /auth/line/unlink', () => {
  it('無 auth header → 401', async () => {
    const app = buildApp();
    const res = await app.request('/auth/line/unlink', { method: 'POST' });
    expect(res.status).toBe(401);
  });

  it('dev-bypass → 解除 LINE 綁定', async () => {
    const app = buildApp();
    vi.mocked(supabaseAdmin.auth.admin.updateUserById).mockResolvedValue(
      { data: { user: {} }, error: null } as ReturnType<typeof supabaseAdmin.auth.admin.updateUserById> extends Promise<infer T> ? T : never,
    );

    const res = await app.request('/auth/line/unlink', {
      method: 'POST',
      headers: { Authorization: 'Bearer dev-bypass-user123' },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(supabaseAdmin.auth.admin.updateUserById).toHaveBeenCalledWith('user123', {
      user_metadata: { provider: 'email', line_user_id: null },
    });
  });

  it('supabase 更新失敗 → 500', async () => {
    const app = buildApp();
    vi.mocked(supabaseAdmin.auth.admin.updateUserById).mockResolvedValue(
      { data: { user: null }, error: { message: 'fail' } } as ReturnType<typeof supabaseAdmin.auth.admin.updateUserById> extends Promise<infer T> ? T : never,
    );

    const res = await app.request('/auth/line/unlink', {
      method: 'POST',
      headers: { Authorization: 'Bearer dev-bypass-user123' },
    });
    expect(res.status).toBe(500);
  });
});

// ─── Claim Event ───

describe('POST /auth/claim-event', () => {
  it('無 auth header → 401', async () => {
    const app = buildApp();
    const res = await app.request('/auth/claim-event', { method: 'POST' });
    expect(res.status).toBe(401);
  });

  it('用戶已有活動 → migrated=false', async () => {
    const app = buildApp();
    vi.mocked(prisma.event.findFirst).mockResolvedValueOnce(
      { id: 'existing', name: '已存在' } as ReturnType<typeof prisma.event.findFirst> extends Promise<infer T> ? T : never,
    );

    const res = await app.request('/auth/claim-event', {
      method: 'POST',
      headers: { Authorization: 'Bearer dev-bypass-user123' },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.migrated).toBe(false);
    expect(body.message).toContain('已經有');
  });

  it('無 session cookie → migrated=false, event=null', async () => {
    const app = buildApp();
    vi.mocked(prisma.event.findFirst).mockResolvedValueOnce(null);

    const res = await app.request('/auth/claim-event', {
      method: 'POST',
      headers: { Authorization: 'Bearer dev-bypass-user123' },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.migrated).toBe(false);
  });

  it('有 session cookie + 匿名活動 → 遷移成功', async () => {
    const app = buildApp();
    vi.mocked(prisma.event.findFirst)
      .mockResolvedValueOnce(null) // no existing user event
      .mockResolvedValueOnce(
        { id: 'anon-evt', ownerId: 'anon-session-123', ownerType: 'anonymous' } as ReturnType<typeof prisma.event.findFirst> extends Promise<infer T> ? T : never,
      );
    vi.mocked(prisma.event.update).mockResolvedValue(
      { id: 'anon-evt', ownerId: 'user123', ownerType: 'user' } as ReturnType<typeof prisma.event.update> extends Promise<infer T> ? T : never,
    );

    const res = await app.request('/auth/claim-event', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer dev-bypass-user123',
        Cookie: 'seatern-session=anon-session-123',
      },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.migrated).toBe(true);
    expect(prisma.event.update).toHaveBeenCalledWith({
      where: { id: 'anon-evt' },
      data: { ownerId: 'user123', ownerType: 'user' },
    });
  });

  it('有 session cookie 但無匿名活動 → migrated=false', async () => {
    const app = buildApp();
    vi.mocked(prisma.event.findFirst)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);

    const res = await app.request('/auth/claim-event', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer dev-bypass-user123',
        Cookie: 'seatern-session=anon-session-123',
      },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.migrated).toBe(false);
  });
});
