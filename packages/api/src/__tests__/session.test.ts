/**
 * Session middleware tests
 *
 * 測試匿名 session / dev-bypass / JWT 驗證失敗降級等行為。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';

// Mock auth-utils
vi.mock('../lib/auth-utils', () => ({
  verifyToken: vi.fn(),
  ensureUser: vi.fn(),
}));

import { sessionMiddleware, type SessionEnv } from '../middleware/session';
import { verifyToken, ensureUser } from '../lib/auth-utils';

function buildApp() {
  const app = new Hono<SessionEnv>();
  app.use('*', sessionMiddleware);
  app.get('/test', (c) =>
    c.json({ ownerId: c.get('ownerId'), ownerType: c.get('ownerType') }),
  );
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('sessionMiddleware', () => {
  it('無 auth header → 匿名 session', async () => {
    const app = buildApp();
    const res = await app.request('/test');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ownerType).toBe('anonymous');
    expect(body.ownerId).toBeTruthy();
  });

  it('帶 seatern-session cookie → 使用該 session ID', async () => {
    const app = buildApp();
    const res = await app.request('/test', {
      headers: { Cookie: 'seatern-session=my-session-123' },
    });
    const body = await res.json();
    expect(body.ownerType).toBe('anonymous');
    expect(body.ownerId).toBe('my-session-123');
  });

  it('dev-bypass token → ownerType=user', async () => {
    const app = buildApp();
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';

    const res = await app.request('/test', {
      headers: { Authorization: 'Bearer dev-bypass-user123' },
    });
    const body = await res.json();
    expect(body.ownerType).toBe('user');
    expect(body.ownerId).toBe('user123');

    process.env.NODE_ENV = originalEnv;
  });

  it('JWT 驗證失敗 → 降級為匿名', async () => {
    const app = buildApp();
    vi.mocked(verifyToken).mockRejectedValue(new Error('Invalid token'));

    const res = await app.request('/test', {
      headers: { Authorization: 'Bearer bad-token' },
    });
    const body = await res.json();
    expect(body.ownerType).toBe('anonymous');
  });

  it('JWT 驗證成功 → ownerType=user', async () => {
    const app = buildApp();
    vi.mocked(verifyToken).mockResolvedValue({ sub: 'jwt-user-id', email: 'test@test.com' });
    vi.mocked(ensureUser).mockResolvedValue('jwt-user-id');

    const res = await app.request('/test', {
      headers: { Authorization: 'Bearer valid-jwt-token' },
    });
    const body = await res.json();
    expect(body.ownerType).toBe('user');
    expect(body.ownerId).toBe('jwt-user-id');
  });
});
