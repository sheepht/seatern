import { createMiddleware } from 'hono/factory'
import { verifyToken, ensureUser } from '../lib/auth-utils'

export type AuthEnv = {
  Variables: {
    userId: string
  }
}

export const authMiddleware = createMiddleware<AuthEnv>(async (c, next) => {
  const authHeader = c.req.header('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return c.json({ error: 'Missing or invalid Authorization header' }, 401)
  }

  const token = authHeader.slice(7)

  // Dev bypass：非 production 環境允許 dev-bypass-<userId> 格式的 token
  if (process.env.NODE_ENV !== 'production' && token.startsWith('dev-bypass-')) {
    const userId = token.slice('dev-bypass-'.length)
    if (!userId) {
      return c.json({ error: 'Invalid dev bypass token' }, 401)
    }
    c.set('userId', userId)
    await next()
    return
  }

  try {
    const payload = await verifyToken(token)
    const userId = await ensureUser(payload)
    c.set('userId', userId)
    await next()
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Token verification failed'
    return c.json({ error: message }, 401)
  }
})
