/**
 * Auth middleware tests
 *
 * 測試 authMiddleware 的 token 驗證邏輯。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock auth-utils
vi.mock('../lib/auth-utils', () => ({
  verifyToken: vi.fn(),
  ensureUser: vi.fn(),
}));

import { Hono } from 'hono';
import { authMiddleware, type AuthEnv } from '../middleware/auth';
import { verifyToken, ensureUser } from '../lib/auth-utils';

function buildApp() {
  const app = new Hono<AuthEnv>();
  app.use('*', authMiddleware);
  app.get('/test', (c) => c.json({ userId: c.get('userId') }));
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('authMiddleware', () => {
  it('無 auth header → 401', async () => {
    const app = buildApp();
    const res = await app.request('/test');
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toContain('Authorization');
  });

  it('dev-bypass token → 設定 userId 並通過', async () => {
    const app = buildApp();
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';

    const res = await app.request('/test', {
      headers: { Authorization: 'Bearer dev-bypass-user123' },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.userId).toBe('user123');

    process.env.NODE_ENV = originalEnv;
  });

  it('dev-bypass token userId 為空 → 401', async () => {
    const app = buildApp();
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';

    const res = await app.request('/test', {
      headers: { Authorization: 'Bearer dev-bypass-' },
    });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toContain('dev bypass');

    process.env.NODE_ENV = originalEnv;
  });

  it('JWT 驗證成功 → 設定 userId', async () => {
    const app = buildApp();
    vi.mocked(verifyToken).mockResolvedValue({ sub: 'jwt-user-id', email: 'test@test.com' });
    vi.mocked(ensureUser).mockResolvedValue('jwt-user-id');

    const res = await app.request('/test', {
      headers: { Authorization: 'Bearer valid-jwt-token' },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.userId).toBe('jwt-user-id');
  });

  it('JWT 驗證失敗 → 401 帶錯誤訊息', async () => {
    const app = buildApp();
    vi.mocked(verifyToken).mockRejectedValue(new Error('Token expired'));

    const res = await app.request('/test', {
      headers: { Authorization: 'Bearer bad-token' },
    });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe('Token expired');
  });
});
