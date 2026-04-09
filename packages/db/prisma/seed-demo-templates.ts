/**
 * 把 5 個 demo JSON fixture 寫入 DB 作為 template events。
 * 使用者進來時 clone endpoint 直接從 DB 複製，不需要前端上傳。
 *
 * Usage: npx tsx packages/db/prisma/seed-demo-templates.ts
 * 冪等：每次執行會先刪除舊 template 再重建。
 */

import { PrismaClient } from '@prisma/client';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

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
    await prisma.event.delete({ where: { id: e.id } }); // cascade deletes all children
  }
  console.log(`Deleted ${oldEvents.length} old templates.`);

  for (const file of FIXTURES) {
    const raw = readFileSync(join(FIXTURE_DIR, file), 'utf-8');
    const data = JSON.parse(raw);
    const templateName = file.replace('seatern-demo-', '').replace('.json', '');

    // Create template event
    const event = await prisma.event.create({
      data: {
        name: `__template:${templateName}`,
        categories: ['男方', '女方', '共同'],
        ownerType: 'anonymous',
        ownerId: TEMPLATE_OWNER_ID,
      },
    });

    // Subcategories
    if (data.subcategories.length > 0) {
      await prisma.subcategory.createMany({
        data: data.subcategories.map((s: { id: string; name: string; category: string }) => ({
          id: s.id, eventId: event.id, name: s.name, category: s.category,
        })),
      });
    }

    // Tables
    if (data.tables.length > 0) {
      await prisma.table.createMany({
        data: data.tables.map((t: { id: string; name: string; capacity: number; positionX: number; positionY: number }) => ({
          id: t.id, eventId: event.id, name: t.name, capacity: t.capacity,
          positionX: t.positionX, positionY: t.positionY,
        })),
      });
    }

    // Guests
    await prisma.guest.createMany({
      data: data.guests.map((g: { id: string; name: string; aliases: string[]; category?: string; rsvpStatus: string; companionCount: number; dietaryNote?: string; specialNote?: string; subcategoryId?: string; assignedTableId?: string; seatIndex?: number | null }) => ({
        id: g.id, eventId: event.id, name: g.name, aliases: g.aliases,
        category: g.category,
        rsvpStatus: (g.rsvpStatus === 'confirmed' || g.rsvpStatus === 'declined') ? g.rsvpStatus : 'confirmed',
        companionCount: g.companionCount ?? 0,
        dietaryNote: g.dietaryNote, specialNote: g.specialNote,
        subcategoryId: g.subcategoryId || null,
        assignedTableId: g.assignedTableId || null,
        seatIndex: g.seatIndex ?? null,
      })),
    });

    // Preferences
    if (data.preferences.length > 0) {
      await prisma.seatPreference.createMany({
        data: data.preferences.map((p: { guestId: string; preferredGuestId: string; rank: number }) => ({
          guestId: p.guestId, preferredGuestId: p.preferredGuestId, rank: p.rank,
        })),
      });
    }

    // Avoid pairs
    if (data.avoidPairs.length > 0) {
      await prisma.avoidPair.createMany({
        data: data.avoidPairs.map((p: { guestAId: string; guestBId: string }) => ({
          eventId: event.id, guestAId: p.guestAId, guestBId: p.guestBId,
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
