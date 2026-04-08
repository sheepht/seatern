import { Hono } from 'hono';
import { prisma } from '@seatern/db';
import type { AuthEnv } from '../middleware/auth';

export const users = new Hono<AuthEnv>();

// PATCH /api/users/me — 更新使用者名稱
users.patch('/me', async (c) => {
  const userId = c.get('userId');
  const body = await c.req.json<{ name?: string }>();
  const name = body.name?.trim();

  if (!name) {
    return c.json({ error: '名稱不可為空' }, 400);
  }
  if (name.length > 100) {
    return c.json({ error: '名稱不可超過 100 字' }, 400);
  }

  const user = await prisma.user.update({
    where: { id: userId },
    data: { name },
    select: { id: true, name: true, email: true, avatarUrl: true },
  });

  return c.json({ user });
});

// DELETE /api/users/me — 軟刪除帳號
users.delete('/me', async (c) => {
  const userId = c.get('userId');

  await prisma.user.update({
    where: { id: userId },
    data: { deletedAt: new Date() },
  });

  return c.json({ message: '帳號已刪除' });
});

// GET /api/users/me/export — 匯出所有使用者資料
users.get('/me/export', async (c) => {
  const userId = c.get('userId');

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { name: true, email: true },
  });

  if (!user) {
    return c.json({ error: 'User not found' }, 404);
  }

  // 找到使用者的活動（目前每個使用者只有一個活動）
  const event = await prisma.event.findFirst({
    where: { ownerId: userId, ownerType: 'user' },
    include: {
      guests: {
        include: {
          subcategory: { select: { name: true, category: true } },
          seatPreferences: {
            include: {
              preferredGuest: { select: { name: true } },
            },
          },
        },
      },
      tables: { select: { name: true, capacity: true, positionX: true, positionY: true, color: true, note: true } },
      subcategories: { select: { name: true, category: true } },
      avoidPairs: {
        include: {
          guestA: { select: { name: true } },
          guestB: { select: { name: true } },
        },
      },
    },
  });

  const exportData = {
    user: { name: user.name, email: user.email },
    event: event ? {
      name: event.name,
      date: event.date,
      categories: event.categories,
    } : null,
    guests: (event?.guests ?? []).map((g: Record<string, unknown> & { name: string; aliases: string[]; category: string | null; subcategory: { name: string } | null; rsvpStatus: string; companionCount: number; dietaryNote: string | null; specialNote: string | null; seatPreferences: Array<{ preferredGuest: { name: string } | null; rank: number }> }) => ({
      name: g.name,
      aliases: g.aliases,
      category: g.category,
      subcategory: g.subcategory?.name ?? null,
      rsvpStatus: g.rsvpStatus,
      companionCount: g.companionCount,
      dietaryNote: g.dietaryNote,
      specialNote: g.specialNote,
      seatPreferences: g.seatPreferences.map((sp: { preferredGuest: { name: string } | null; rank: number }) => ({
        preferredGuestName: sp.preferredGuest?.name ?? '',
        rank: sp.rank,
      })),
    })),
    tables: event?.tables ?? [],
    subcategories: event?.subcategories ?? [],
    avoidPairs: (event?.avoidPairs ?? []).map((ap: { guestA: { name: string } | null; guestB: { name: string } | null; reason: string | null }) => ({
      guest1Name: ap.guestA?.name ?? '',
      guest2Name: ap.guestB?.name ?? '',
      reason: ap.reason,
    })),
  };

  c.header('Content-Disposition', 'attachment; filename="seatern-export.json"');
  c.header('Content-Type', 'application/json');
  return c.json(exportData);
});
