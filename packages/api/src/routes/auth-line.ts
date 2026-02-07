import { Hono } from 'hono'
import { setCookie, getCookie } from 'hono/cookie'
import { supabaseAdmin } from '../lib/supabase-admin'

const LINE_AUTH_URL = 'https://access.line.me/oauth2/v2.1/authorize'
const LINE_TOKEN_URL = 'https://api.line.me/oauth2/v2.1/token'
const LINE_PROFILE_URL = 'https://api.line.me/v2/profile'

function getEnv() {
  const channelId = process.env.LINE_CHANNEL_ID
  const channelSecret = process.env.LINE_CHANNEL_SECRET
  if (!channelId || !channelSecret) {
    throw new Error('LINE_CHANNEL_ID and LINE_CHANNEL_SECRET must be set')
  }
  return { channelId, channelSecret }
}

function generateState(): string {
  const array = new Uint8Array(32)
  crypto.getRandomValues(array)
  return Array.from(array, (b) => b.toString(16).padStart(2, '0')).join('')
}

export const authLineRoute = new Hono()

// GET /api/auth/line — 發起 LINE OAuth
authLineRoute.get('/', (c) => {
  const { channelId } = getEnv()
  const state = generateState()
  const origin = process.env.VITE_APP_URL || 'http://localhost:3001'
  const redirectUri = `${origin}/api/auth/line/callback`

  setCookie(c, 'line_oauth_state', state, {
    httpOnly: true,
    sameSite: 'Lax',
    maxAge: 600,
    path: '/',
  })

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: channelId,
    redirect_uri: redirectUri,
    state,
    scope: 'profile openid email',
  })

  return c.redirect(`${LINE_AUTH_URL}?${params.toString()}`)
})

// GET /api/auth/line/callback — LINE 回呼處理
authLineRoute.get('/callback', async (c) => {
  const frontendUrl = process.env.VITE_FRONTEND_URL || 'http://localhost:5173'

  try {
    // 1. 驗 CSRF state
    const stateFromQuery = c.req.query('state')
    const stateFromCookie = getCookie(c, 'line_oauth_state')

    if (!stateFromQuery || !stateFromCookie || stateFromQuery !== stateFromCookie) {
      return c.redirect(`${frontendUrl}/login?error=${encodeURIComponent('LINE 登入失敗：state 驗證失敗')}`)
    }

    // 清除 state cookie
    setCookie(c, 'line_oauth_state', '', { maxAge: 0, path: '/' })

    // 2. 檢查 LINE 回傳的錯誤
    const errorParam = c.req.query('error')
    if (errorParam) {
      const errorDesc = c.req.query('error_description') || errorParam
      return c.redirect(`${frontendUrl}/login?error=${encodeURIComponent(`LINE 登入失敗：${errorDesc}`)}`)
    }

    // 3. 用 code 換 token
    const code = c.req.query('code')
    if (!code) {
      return c.redirect(`${frontendUrl}/login?error=${encodeURIComponent('LINE 登入失敗：缺少 code')}`)
    }

    const { channelId, channelSecret } = getEnv()
    const origin = process.env.VITE_APP_URL || 'http://localhost:3001'
    const redirectUri = `${origin}/api/auth/line/callback`

    const tokenRes = await fetch(LINE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
        client_id: channelId,
        client_secret: channelSecret,
      }),
    })

    if (!tokenRes.ok) {
      const errBody = await tokenRes.text()
      console.error('LINE token exchange failed:', errBody)
      return c.redirect(`${frontendUrl}/login?error=${encodeURIComponent('LINE 登入失敗：token 交換失敗')}`)
    }

    const tokenData = (await tokenRes.json()) as {
      access_token: string
      id_token?: string
      token_type: string
    }

    // 4. 取 LINE profile
    const profileRes = await fetch(LINE_PROFILE_URL, {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    })

    if (!profileRes.ok) {
      console.error('LINE profile fetch failed:', await profileRes.text())
      return c.redirect(`${frontendUrl}/login?error=${encodeURIComponent('LINE 登入失敗：取得個人資料失敗')}`)
    }

    const profile = (await profileRes.json()) as {
      userId: string
      displayName: string
      pictureUrl?: string
      statusMessage?: string
    }

    // 5. 用 LINE email 或 placeholder 建立/找到 Supabase user
    // LINE profile API 不回傳 email，用 placeholder
    const email = `line_${profile.userId}@line.seatern.app`

    // 先查是否已有此 email 的 user
    const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers()
    let userId: string | undefined

    const existingUser = existingUsers?.users?.find(
      (u) =>
        u.email === email ||
        u.user_metadata?.line_user_id === profile.userId,
    )

    if (existingUser) {
      userId = existingUser.id
      // 更新 metadata（確保 line_user_id 有記錄）
      await supabaseAdmin.auth.admin.updateUserById(userId, {
        user_metadata: {
          ...existingUser.user_metadata,
          line_user_id: profile.userId,
          name: profile.displayName,
          avatar_url: profile.pictureUrl,
        },
      })
    } else {
      // 建立新 user
      const { data: newUser, error: createErr } =
        await supabaseAdmin.auth.admin.createUser({
          email,
          email_confirm: true,
          user_metadata: {
            line_user_id: profile.userId,
            name: profile.displayName,
            full_name: profile.displayName,
            avatar_url: profile.pictureUrl,
          },
        })

      if (createErr || !newUser.user) {
        console.error('Supabase createUser failed:', createErr)
        return c.redirect(`${frontendUrl}/login?error=${encodeURIComponent('LINE 登入失敗：建立帳號失敗')}`)
      }
      userId = newUser.user.id
    }

    // 6. 產生 magic link，取 action_link 讓 Supabase 自己驗證
    const { data: linkData, error: linkErr } =
      await supabaseAdmin.auth.admin.generateLink({
        type: 'magiclink',
        email,
        options: {
          redirectTo: `${frontendUrl}/events`,
        },
      })

    if (linkErr || !linkData?.properties?.action_link) {
      console.error('generateLink failed:', linkErr)
      return c.redirect(`${frontendUrl}/login?error=${encodeURIComponent('LINE 登入失敗：產生登入連結失敗')}`)
    }

    // 7. Redirect 到 Supabase verify endpoint → 驗證後帶 session 跳回前端
    return c.redirect(linkData.properties.action_link)
  } catch (err) {
    console.error('LINE auth error:', err)
    return c.redirect(`${frontendUrl}/login?error=${encodeURIComponent('LINE 登入失敗：內部錯誤')}`)
  }
})
