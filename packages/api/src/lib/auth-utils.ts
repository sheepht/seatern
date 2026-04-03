import { jwtVerify, createRemoteJWKSet } from 'jose'
import { prisma } from '@seatern/db'

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

export async function verifyToken(token: string) {
  const { payload } = await jwtVerify(token, getJWKS(), {
    issuer: `${SUPABASE_URL}/auth/v1`,
  })
  return payload
}

export async function ensureUser(payload: { sub?: string; email?: unknown; user_metadata?: unknown }) {
  const userId = payload.sub
  if (!userId) throw new Error('Invalid token: missing sub claim')

  const email = (payload.email as string) || `${userId}@unknown`
  const metadata = (payload.user_metadata as Record<string, unknown>) || {}
  const name =
    (metadata.full_name as string) ||
    (metadata.name as string) ||
    email.split('@')[0]
  const avatarUrl = (metadata.avatar_url as string) || undefined

  await prisma.user.upsert({
    where: { id: userId },
    update: { email, name, avatarUrl },
    create: { id: userId, email, name, avatarUrl },
  })

  return userId
}
