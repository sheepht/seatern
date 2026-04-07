import { Hono } from 'hono';
import { prisma } from '@seatern/db';

const admin = new Hono();

// POST /admin/login — 驗證密鑰，回傳 token
admin.post('/login', async (c) => {
  const { password } = await c.req.json<{ password: string }>();
  const secret = process.env.ADMIN_SECRET;
  if (!secret || password !== secret) {
    return c.json({ error: '密碼錯誤' }, 401);
  }
  // 用 secret 的 hash 當作簡易 token（不需要額外 library）
  const token = Buffer.from(secret).toString('base64');
  return c.json({ token });
});

// 驗證 admin token（login 以外的路由）
admin.use('*', async (c, next) => {
  const auth = c.req.header('Authorization');
  const secret = process.env.ADMIN_SECRET;
  if (!secret) return c.json({ error: 'ADMIN_SECRET not configured' }, 500);

  const expectedToken = Buffer.from(secret).toString('base64');
  if (auth !== `Bearer ${expectedToken}`) {
    return c.json({ error: 'Unauthorized' }, 401);
  }
  await next();
});

// GET /admin/pending-plans — 列出所有待審核的付費申請
admin.get('/pending-plans', async (c) => {
  const events = await prisma.event.findMany({
    where: { planStatus: 'pending' },
    orderBy: { updatedAt: 'desc' },
    include: {
      _count: { select: { guests: true, tables: true } },
    },
  });

  // 查出每個活動的 owner email/name
  const results = await Promise.all(
    events.map(async (event) => {
      let ownerName = '匿名用戶';
      let ownerEmail = '';
      if (event.ownerType === 'user') {
        const user = await prisma.user.findUnique({
          where: { id: event.ownerId },
          select: { name: true, email: true },
        });
        if (user) {
          ownerName = user.name;
          ownerEmail = user.email;
        }
      }
      return {
        id: event.id,
        name: event.name,
        planType: event.planType,
        planStatus: event.planStatus,
        ownerName,
        ownerEmail,
        guestCount: event._count.guests,
        tableCount: event._count.tables,
        planNote: event.planNote,
        planCreatedAt: event.planCreatedAt,
        updatedAt: event.updatedAt,
      };
    })
  );

  return c.json(results);
});

// GET /admin/all-plans — 列出所有有方案的活動（含 active、expired）
admin.get('/all-plans', async (c) => {
  const events = await prisma.event.findMany({
    where: { planType: { not: null } },
    orderBy: { updatedAt: 'desc' },
    include: {
      _count: { select: { guests: true, tables: true } },
    },
  });

  const results = await Promise.all(
    events.map(async (event) => {
      let ownerName = '匿名用戶';
      let ownerEmail = '';
      if (event.ownerType === 'user') {
        const user = await prisma.user.findUnique({
          where: { id: event.ownerId },
          select: { name: true, email: true },
        });
        if (user) {
          ownerName = user.name;
          ownerEmail = user.email;
        }
      }

      const isExpired = event.planExpiresAt && new Date() > event.planExpiresAt;

      return {
        id: event.id,
        name: event.name,
        planType: event.planType,
        planStatus: isExpired ? 'expired' : event.planStatus,
        planExpiresAt: event.planExpiresAt,
        ownerName,
        ownerEmail,
        guestCount: event._count.guests,
        tableCount: event._count.tables,
        planNote: event.planNote,
        planCreatedAt: event.planCreatedAt,
        updatedAt: event.updatedAt,
      };
    })
  );

  return c.json(results);
});

// POST /admin/approve/:eventId — 核准付費方案
admin.post('/approve/:eventId', async (c) => {
  const { eventId } = c.req.param();

  const event = await prisma.event.findUnique({ where: { id: eventId } });
  if (!event) return c.json({ error: 'Event not found' }, 404);
  if (!event.planType) return c.json({ error: '此活動沒有待審方案' }, 400);

  const PLAN_DAYS: Record<string, number> = { '30': 30, '50': 30, '80': 60, '200': 90 };
  const days = PLAN_DAYS[event.planType] ?? 30;
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + days);

  await prisma.event.update({
    where: { id: eventId },
    data: { planStatus: 'active', planExpiresAt: expiresAt },
  });

  console.log(`[ADMIN] 核准活動 ${eventId} 的 ${event.planType} 桌方案，到期 ${expiresAt.toISOString()}`);
  return c.json({ status: 'active', expiresAt: expiresAt.toISOString() });
});

// POST /admin/reject/:eventId — 拒絕付費方案
admin.post('/reject/:eventId', async (c) => {
  const { eventId } = c.req.param();

  await prisma.event.update({
    where: { id: eventId },
    data: { planType: null, planStatus: null, planExpiresAt: null },
  });

  console.log(`[ADMIN] 拒絕活動 ${eventId} 的付費方案`);
  return c.json({ ok: true });
});

// PATCH /admin/events/:eventId — 修改方案細節
admin.patch('/events/:eventId', async (c) => {
  const { eventId } = c.req.param();

  const event = await prisma.event.findUnique({ where: { id: eventId } });
  if (!event) return c.json({ error: 'Event not found' }, 404);

  const body = await c.req.json<{
    planType?: string | null;
    planStatus?: string | null;
    planExpiresAt?: string | null;
    planCreatedAt?: string | null;
    planNote?: string | null;
  }>();

  const data: Record<string, string | Date | null> = {};
  if ('planType' in body) data.planType = body.planType || null;
  if ('planStatus' in body) data.planStatus = body.planStatus || null;
  if ('planExpiresAt' in body) data.planExpiresAt = body.planExpiresAt ? new Date(body.planExpiresAt) : null;
  if ('planCreatedAt' in body) data.planCreatedAt = body.planCreatedAt ? new Date(body.planCreatedAt) : null;
  if ('planNote' in body) data.planNote = body.planNote || null;

  const updated = await prisma.event.update({
    where: { id: eventId },
    data,
  });

  console.log(`[ADMIN] 修改活動 ${eventId} 方案：`, data);
  return c.json({ ok: true, planType: updated.planType, planStatus: updated.planStatus, planExpiresAt: updated.planExpiresAt });
});

export { admin };
