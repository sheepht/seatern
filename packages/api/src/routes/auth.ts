import { Hono } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { prisma } from '@seatern/db';
import { supabaseAdmin } from '../lib/supabase-admin';
import { verifyToken, ensureUser } from '../lib/auth-utils';
import type { SessionEnv } from '../middleware/session';

const auth = new Hono<SessionEnv>();

const SESSION_COOKIE = 'seatern-session';
const LINE_STATE_COOKIE = 'line-oauth-state';

const LINE_CHANNEL_ID = process.env.LINE_CHANNEL_ID;
const LINE_CHANNEL_SECRET = process.env.LINE_CHANNEL_SECRET;
const LINE_CALLBACK_URL = process.env.LINE_CALLBACK_URL;

// ─── LINE OAuth ──────────────────────────────────────

// GET /auth/line — redirect to LINE Login
auth.get('/line', (c) => {
  if (!LINE_CHANNEL_ID || !LINE_CALLBACK_URL) {
    return c.json({ error: 'LINE Login not configured' }, 500);
  }

  const state = crypto.randomUUID();
  setCookie(c, LINE_STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'Lax',
    maxAge: 60 * 10, // 10 minutes
    path: '/',
  });

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: LINE_CHANNEL_ID,
    redirect_uri: LINE_CALLBACK_URL,
    state,
    scope: 'profile openid email',
  });

  return c.redirect(`https://access.line.me/oauth2/v2.1/authorize?${params}`);
});

// GET /auth/line/callback — exchange code for token, create user, redirect
auth.get('/line/callback', async (c) => {
  const code = c.req.query('code');
  const state = c.req.query('state');
  const error = c.req.query('error');
  const storedState = getCookie(c, LINE_STATE_COOKIE);

  deleteCookie(c, LINE_STATE_COOKIE, { path: '/' });

  const frontendOrigin = process.env.VITE_FRONTEND_URL || 'http://localhost:5173';
  const loginError = (msg: string) =>
    c.redirect(`${frontendOrigin}/login?error=${encodeURIComponent(msg)}`);

  if (error) return loginError('LINE 登入已取消');
  if (!code || !state) return loginError('LINE 登入失敗');
  if (state !== storedState) return loginError('登入驗證失敗，請重試');

  // 判斷是 link mode 還是 login mode
  const isLinkMode = state.startsWith('link:');
  const linkUserId = isLinkMode ? state.split(':')[1] : null;

  if (!LINE_CHANNEL_ID || !LINE_CHANNEL_SECRET || !LINE_CALLBACK_URL) {
    return loginError('LINE Login 未設定');
  }

  try {
    // Exchange code for access token
    const tokenRes = await fetch('https://api.line.me/oauth2/v2.1/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: LINE_CALLBACK_URL,
        client_id: LINE_CHANNEL_ID,
        client_secret: LINE_CHANNEL_SECRET,
      }),
    });

    if (!tokenRes.ok) {
      const errBody = await tokenRes.text();
      console.error('LINE token exchange failed:', tokenRes.status, errBody);
      return loginError('LINE 登入失敗：token exchange');
    }
    const tokenData = await tokenRes.json() as { access_token: string; id_token?: string };

    // Decode id_token to extract email (LINE returns email in JWT, not profile API)
    let lineEmail: string | undefined;
    if (tokenData.id_token) {
      try {
        const [, payloadB64] = tokenData.id_token.split('.');
        const payload = JSON.parse(atob(payloadB64.replace(/-/g, '+').replace(/_/g, '/')));
        lineEmail = payload.email;
      } catch {
        // id_token decode failed, proceed without email
      }
    }

    // Fetch LINE profile
    const profileRes = await fetch('https://api.line.me/v2/profile', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });

    if (!profileRes.ok) {
      const errBody = await profileRes.text();
      console.error('LINE profile fetch failed:', profileRes.status, errBody);
      return loginError('無法取得 LINE 個人資料');
    }
    const profile = await profileRes.json() as {
      userId: string
      displayName: string
      pictureUrl?: string
    };

    // ─── Link mode：綁定 LINE 到現有帳號 ──────────────
    if (isLinkMode && linkUserId) {
      // 把 LINE 資訊寫入現有用戶的 user_metadata
      const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(linkUserId, {
        user_metadata: {
          line_user_id: profile.userId,
          line_display_name: profile.displayName,
          line_avatar_url: profile.pictureUrl,
        },
      });

      if (updateError) {
        console.error('LINE link failed:', updateError);
        return loginError('LINE 綁定失敗');
      }

      // Redirect 回設定頁
      const frontendOrigin = process.env.VITE_FRONTEND_URL || 'http://localhost:5173';
      return c.redirect(`${frontendOrigin}/workspace/settings?linked=line`);
    }

    // ─── Login mode：正常 LINE 登入 ──────────────────
    // Use real email if available, fallback to synthetic email
    const email = lineEmail || `line_${profile.userId}@seatern.app`;
    let supabaseUserId: string;

    // Try to create first; if email already exists, find the existing user
    const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: {
        name: profile.displayName,
        full_name: profile.displayName,
        avatar_url: profile.pictureUrl,
        provider: 'line',
        line_user_id: profile.userId,
      },
    });

    if (newUser?.user) {
      supabaseUserId = newUser.user.id;
    } else if (createError?.message?.includes('already been registered')) {
      // User exists, find by email
      const { data: listData } = await supabaseAdmin.auth.admin.listUsers();
      const existing = listData?.users?.find(u => u.email === email);
      if (!existing) {
        console.error('LINE user exists in Supabase but not found by filter:', email);
        return loginError('登入處理失敗');
      }
      supabaseUserId = existing.id;
    } else {
      console.error('Supabase createUser failed:', createError);
      return loginError('建立帳號失敗');
    }

    // Ensure local User record exists
    await ensureUser({
      sub: supabaseUserId,
      email,
      user_metadata: {
        name: profile.displayName,
        full_name: profile.displayName,
        avatar_url: profile.pictureUrl,
      },
    });

    // Generate a magic link for the user to establish Supabase session
    const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: 'magiclink',
      email,
    });

    if (linkError || !linkData) {
      console.error('Supabase generateLink failed:', linkError);
      return loginError('登入處理失敗');
    }

    // Redirect to frontend auth callback with token_hash for supabase.auth.verifyOtp
    const frontendOrigin2 = process.env.VITE_FRONTEND_URL || 'http://localhost:5173';
    const redirectUrl = new URL('/auth/callback', frontendOrigin2);
    redirectUrl.searchParams.set('token_hash', linkData.properties.hashed_token);
    redirectUrl.searchParams.set('type', 'magiclink');

    return c.redirect(redirectUrl.toString());
  } catch (err) {
    console.error('LINE OAuth error:', err);
    return loginError('LINE 登入失敗');
  }
});

// ─── LINE Link（綁定 LINE 到現有帳號）─────────────────

// GET /auth/line/link — 發起 LINE OAuth，帶 link mode
auth.get('/line/link', async (c) => {
  if (!LINE_CHANNEL_ID || !LINE_CALLBACK_URL) {
    return c.json({ error: 'LINE Login not configured' }, 500);
  }

  // 驗證目前登入的用戶
  const authHeader = c.req.header('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return c.json({ error: 'Unauthorized' }, 401);
  }
  const token = authHeader.slice(7);
  let userId: string;
  if (process.env.NODE_ENV !== 'production' && token.startsWith('dev-bypass-')) {
    userId = token.slice('dev-bypass-'.length);
  } else {
    const payload = await verifyToken(token);
    userId = await ensureUser(payload);
  }

  // state 裡編碼 link mode + userId
  const state = `link:${userId}:${crypto.randomUUID()}`;
  setCookie(c, LINE_STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'Lax',
    maxAge: 60 * 10,
    path: '/',
  });

  // 回傳 LINE OAuth URL 讓前端 redirect（因為前端需要帶 auth header）
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: LINE_CHANNEL_ID,
    redirect_uri: LINE_CALLBACK_URL,
    state,
    scope: 'profile openid email',
  });

  return c.json({ url: `https://access.line.me/oauth2/v2.1/authorize?${params}` });
});

// POST /auth/line/unlink — 解除 LINE 綁定
auth.post('/line/unlink', async (c) => {
  const authHeader = c.req.header('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return c.json({ error: 'Unauthorized' }, 401);
  }
  const token = authHeader.slice(7);
  let userId: string;
  if (process.env.NODE_ENV !== 'production' && token.startsWith('dev-bypass-')) {
    userId = token.slice('dev-bypass-'.length);
  } else {
    const payload = await verifyToken(token);
    userId = await ensureUser(payload);
  }

  // 清除 user_metadata 裡的 LINE 資訊
  const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, {
    user_metadata: {
      provider: 'email',
      line_user_id: null,
    },
  });

  if (error) {
    return c.json({ error: '解除綁定失敗' }, 500);
  }

  return c.json({ ok: true });
});

// ─── Claim Event ─────────────────────────────────────

// POST /auth/claim-event — migrate anonymous event to logged-in user
auth.post('/claim-event', async (c) => {
  // Require authentication
  const authHeader = c.req.header('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const token = authHeader.slice(7);
  let userId: string;

  // Dev bypass
  if (process.env.NODE_ENV !== 'production' && token.startsWith('dev-bypass-')) {
    userId = token.slice('dev-bypass-'.length);
    if (!userId) return c.json({ error: 'Invalid token' }, 401);
  } else {
    try {
      const payload = await verifyToken(token);
      userId = await ensureUser(payload);
    } catch {
      return c.json({ error: 'Invalid token' }, 401);
    }
  }

  // Read session UUID from httpOnly cookie
  const sessionId = getCookie(c, SESSION_COOKIE);

  // Check if user already owns an event
  const existingEvent = await prisma.event.findFirst({
    where: { ownerId: userId, ownerType: 'user' },
  });

  if (existingEvent) {
    // User already has an event, don't migrate
    // Clear the anonymous session cookie
    if (sessionId) {
      deleteCookie(c, SESSION_COOKIE, { path: '/' });
    }
    return c.json({
      migrated: false,
      event: existingEvent,
      message: '你已經有一個活動了',
    });
  }

  if (!sessionId) {
    // No session cookie, nothing to migrate
    return c.json({ migrated: false, event: null });
  }

  // Find and migrate the anonymous event
  try {
    const anonymousEvent = await prisma.event.findFirst({
      where: { ownerId: sessionId, ownerType: 'anonymous' },
    });

    if (!anonymousEvent) {
      deleteCookie(c, SESSION_COOKIE, { path: '/' });
      return c.json({ migrated: false, event: null });
    }

    const migratedEvent = await prisma.event.update({
      where: { id: anonymousEvent.id },
      data: { ownerId: userId, ownerType: 'user' },
    });

    // Clear the anonymous session cookie
    deleteCookie(c, SESSION_COOKIE, { path: '/' });

    return c.json({ migrated: true, event: migratedEvent });
  } catch (err) {
    console.error('claim-event error:', err);
    return c.json({ error: '遷移失敗，請重試' }, 500);
  }
});

export { auth };
