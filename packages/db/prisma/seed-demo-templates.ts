/**
 * 把 5 個 demo JSON fixture 寫入 DB 作為 template events。
 * 使用者進來時 clone endpoint 直接從 DB 複製，不需要前端上傳。
 *
 * Usage: npx tsx packages/db/prisma/seed-demo-templates.ts
 * 冪等：每次執行會先刪除舊 template 再重建。
 * 所有 ID 重新生成，避免與已存在的 seed 資料衝突。
 */

import { PrismaClient } from '@prisma/client';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

const prisma = new PrismaClient();

const TEMPLATE_OWNER_ID = '__demo_template__';
const FIXTURE_DIR = join(import.meta.dirname, '..', '..', 'web', 'public');
const FIXTURES = [
  'seatern-demo-mix.json',
  'seatern-demo-entertainment.json',
  'seatern-demo-youtuber.json',
  'seatern-demo-politics.json',
  'seatern-demo-sports.json',
];

async function main() {
  console.log('Cleaning old demo templates...');
  const oldEvents = await prisma.event.findMany({
    where: { ownerId: TEMPLATE_OWNER_ID },
    select: { id: true },
  });
  for (const e of oldEvents) {
    await prisma.event.delete({ where: { id: e.id } });
  }
  console.log(`Deleted ${oldEvents.length} old templates.`);

  for (const file of FIXTURES) {
    const raw = readFileSync(join(FIXTURE_DIR, file), 'utf-8');
    const data = JSON.parse(raw);
    const templateName = file.replace('seatern-demo-', '').replace('.json', '');

    // 每個 fixture 都重新生成 ID，避免與 DB 中已存在的資料衝突
    const idMap = new Map<string, string>();
    const remap = (oldId: string) => {
      let newId = idMap.get(oldId);
      if (!newId) { newId = randomUUID(); idMap.set(oldId, newId); }
      return newId;
    };

    const event = await prisma.event.create({
      data: {
        name: `__template:${templateName}`,
        categories: ['男方', '女方', '共同'],
        ownerType: 'anonymous',
        ownerId: TEMPLATE_OWNER_ID,
      },
    });

    if (data.subcategories.length > 0) {
      await prisma.subcategory.createMany({
        data: data.subcategories.map((s: { id: string; name: string; category: string }) => ({
          id: remap(s.id), eventId: event.id, name: s.name, category: s.category,
        })),
      });
    }

    if (data.tables.length > 0) {
      await prisma.table.createMany({
        data: data.tables.map((t: { id: string; name: string; capacity: number; positionX: number; positionY: number }) => ({
          id: remap(t.id), eventId: event.id, name: t.name, capacity: t.capacity,
          positionX: t.positionX, positionY: t.positionY,
        })),
      });
    }

    await prisma.guest.createMany({
      data: data.guests.map((g: { id: string; name: string; aliases: string[]; category?: string; rsvpStatus: string; companionCount: number; dietaryNote?: string; specialNote?: string; subcategoryId?: string; assignedTableId?: string; seatIndex?: number | null }) => ({
        id: remap(g.id), eventId: event.id, name: g.name, aliases: g.aliases,
        category: g.category,
        rsvpStatus: (g.rsvpStatus === 'confirmed' || g.rsvpStatus === 'declined') ? g.rsvpStatus : 'confirmed',
        companionCount: g.companionCount ?? 0,
        dietaryNote: g.dietaryNote, specialNote: g.specialNote,
        subcategoryId: g.subcategoryId ? remap(g.subcategoryId) : null,
        assignedTableId: g.assignedTableId ? remap(g.assignedTableId) : null,
        seatIndex: g.seatIndex ?? null,
      })),
    });

    if (data.preferences.length > 0) {
      await prisma.seatPreference.createMany({
        data: data.preferences.map((p: { guestId: string; preferredGuestId: string; rank: number }) => ({
          guestId: remap(p.guestId), preferredGuestId: remap(p.preferredGuestId), rank: p.rank,
        })),
      });
    }

    if (data.avoidPairs.length > 0) {
      await prisma.avoidPair.createMany({
        data: data.avoidPairs.map((p: { guestAId: string; guestBId: string }) => ({
          eventId: event.id, guestAId: remap(p.guestAId), guestBId: remap(p.guestBId),
        })),
      });
    }

    console.log(`Created template "${templateName}": ${data.guests.length} guests, ${data.tables.length} tables`);
  }

  console.log('\nDone. 5 demo templates seeded.');
}

main()
  .catch((e) => { console.error('Failed:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
