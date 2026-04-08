import { createMiddleware } from 'hono/factory';
import { getCookie, setCookie } from 'hono/cookie';
import { randomUUID } from 'crypto';
import { verifyToken, ensureUser } from '../lib/auth-utils.ts';

/**
 * Session middleware：處理匿名 session 和登入用戶
 *
 * 優先順序：
 * 1. Authorization: Bearer <token> → JWT 驗證 → ownerType='user'
 * 2. seatern-session cookie → ownerType='anonymous'
 * 3. 都沒有 → 自動產生新的 anonymous session UUID
 */

export type SessionEnv = {
  Variables: {
    ownerId: string
    ownerType: 'user' | 'anonymous'
  }
}

const SESSION_COOKIE = 'seatern-session';

export const sessionMiddleware = createMiddleware<SessionEnv>(async (c, next) => {
  // 如果有 Authorization header，嘗試驗證 JWT
  const authHeader = c.req.header('Authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7);

    // Dev bypass：非 production 環境允許 dev-bypass-<userId> 格式的 token
    if (process.env.NODE_ENV !== 'production' && token.startsWith('dev-bypass-')) {
      const userId = token.slice('dev-bypass-'.length);
      if (userId) {
        c.set('ownerId', userId);
        c.set('ownerType', 'user');
        await next();
        return;
      }
    }

    // 驗證真正的 JWT
    try {
      const payload = await verifyToken(token);
      const userId = await ensureUser(payload);
      c.set('ownerId', userId);
      c.set('ownerType', 'user');
      await next();
      return;
    } catch {
      // JWT 驗證失敗，降級為匿名模式（不中斷使用者體驗）
    }
  }

  // 匿名 session
  let sessionId = getCookie(c, SESSION_COOKIE);
  if (!sessionId) {
    sessionId = randomUUID();
    setCookie(c, SESSION_COOKIE, sessionId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'Lax',
      maxAge: 60 * 60 * 24 * 365, // 1 year
      path: '/',
    });
  }

  c.set('ownerId', sessionId);
  c.set('ownerType', 'anonymous');
  await next();
});
