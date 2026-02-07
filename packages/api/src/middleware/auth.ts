import { createMiddleware } from 'hono/factory'
import { jwtVerify, createRemoteJWKSet } from 'jose'
import { prisma } from '@seatern/db'

export type AuthEnv = {
  Variables: {
    userId: string
  }
}

const SUPABASE_URL = process.env.VITE_SUPABASE_URL

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null

function getJWKS() {
  if (!jwks) {
    if (!SUPABASE_URL) {
      throw new Error('SUPABASE_URL is not configured')
    }
    jwks = createRemoteJWKSet(
      new URL(`${SUPABASE_URL}/auth/v1/.well-known/jwks.json`),
    )
  }
  return jwks
}

async function verifyToken(token: string) {
  const { payload } = await jwtVerify(token, getJWKS(), {
    issuer: `${SUPABASE_URL}/auth/v1`,
  })
  return payload
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
    const userId = payload.sub
    if (!userId) {
      return c.json({ error: 'Invalid token: missing sub claim' }, 401)
    }

    // Auto-create user on first request
    const existingUser = await prisma.user.findUnique({ where: { id: userId } })
    if (!existingUser) {
      const email = (payload.email as string) || `${userId}@unknown`
      const name =
        (payload.user_metadata as Record<string, unknown>)?.full_name as string ||
        (payload.user_metadata as Record<string, unknown>)?.name as string ||
        email.split('@')[0]
      const avatarUrl =
        (payload.user_metadata as Record<string, unknown>)?.avatar_url as string ||
        undefined

      await prisma.user.create({
        data: { id: userId, email, name, avatarUrl },
      })
    }

    c.set('userId', userId)
    await next()
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Token verification failed'
    return c.json({ error: message }, 401)
  }
})
