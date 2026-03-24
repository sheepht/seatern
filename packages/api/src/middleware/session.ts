import { createMiddleware } from 'hono/factory'
import { getCookie, setCookie } from 'hono/cookie'
import { randomUUID } from 'crypto'

/**
 * Session middleware：處理匿名 session 和登入用戶
 *
 * 優先順序：
 * 1. Authorization header → 已登入用戶（走 auth middleware）
 * 2. x-session-id cookie → 匿名 session
 * 3. 都沒有 → 自動產生新的 anonymous session UUID
 *
 * 設定 c.get('ownerId') 和 c.get('ownerType')
 */

export type SessionEnv = {
  Variables: {
    ownerId: string
    ownerType: 'user' | 'anonymous'
  }
}

const SESSION_COOKIE = 'seatern-session'

export const sessionMiddleware = createMiddleware<SessionEnv>(async (c, next) => {
  // 如果有 Authorization header，讓 auth middleware 處理
  const authHeader = c.req.header('Authorization')
  if (authHeader?.startsWith('Bearer ')) {
    // Dev bypass
    const token = authHeader.slice(7)
    if (process.env.NODE_ENV !== 'production' && token.startsWith('dev-bypass-')) {
      const userId = token.slice('dev-bypass-'.length)
      if (userId) {
        c.set('ownerId', userId)
        c.set('ownerType', 'user')
        await next()
        return
      }
    }
    // TODO: JWT verification for production auth
    // For now, fall through to anonymous
  }

  // 匿名 session
  let sessionId = getCookie(c, SESSION_COOKIE)
  if (!sessionId) {
    sessionId = randomUUID()
    setCookie(c, SESSION_COOKIE, sessionId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'Lax',
      maxAge: 60 * 60 * 24 * 365, // 1 year
      path: '/',
    })
  }

  c.set('ownerId', sessionId)
  c.set('ownerType', 'anonymous')
  await next()
})
