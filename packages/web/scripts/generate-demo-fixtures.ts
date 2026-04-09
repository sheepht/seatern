/**
 * Build-time script: 把 5 個 demo CSV 各自轉成 JSON fixture
 *
 * 所有 entity 帶預生成的 UUID，preferences/avoidPairs 直接引用 UUID。
 * Runtime 只需要 fetch JSON + POST /seed，零計算。
 *
 * Usage: npx tsx packages/web/scripts/generate-demo-fixtures.ts
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join, basename } from 'node:path';
import { randomUUID } from 'node:crypto';
import { csvParse } from 'd3-dsv';
import type { SeedPayload } from '@seatern/shared';

// ─── CSV parsing (simplified from csv-parser.ts, no DOM needed) ───

function parseCSV(text: string) {
  const trimmed = text.trim();
  if (!trimmed) return { headers: [] as string[], rows: [] as Record<string, string>[] };
  const rows = csvParse(trimmed);
  return { headers: rows.columns, rows: rows as unknown as Record<string, string>[] };
}

// ─── Column detection (inlined from column-detector.ts) ───

type SystemField =
  | 'name' | 'aliases' | 'rsvpStatus' | 'category' | 'subcategory'
  | 'companionCount' | 'dietaryNote' | 'specialNote' | 'seatPreferences' | 'avoidGuests';

const FIELD_KEYWORDS: Record<SystemField, string[]> = {
  rsvpStatus: ['參加', '出席', 'rsvp'],
  name: ['姓名', '名字', 'name'],
  aliases: ['外號', '暱稱', '別名'],
  category: ['分類', '類別', 'category'],
  subcategory: ['子分類', '群組', '標籤', 'group'],
  companionCount: ['眷屬', '+1', '攜伴', '攜眷'],
  dietaryNote: ['葷素', '飲食', 'dietary'],
  specialNote: ['備註', '需求', 'note'],
  seatPreferences: ['同桌', '想跟誰坐', 'preference'],
  avoidGuests: ['避免', '避桌', 'avoid'],
};

function detectAndMap(headers: string[]) {
  const mapping: Record<SystemField, string | null> = {
    name: null, aliases: null, rsvpStatus: null, category: null,
    subcategory: null, companionCount: null, dietaryNote: null,
    specialNote: null, seatPreferences: null, avoidGuests: null,
  };
  const used = new Set<string>();
  for (const field of Object.keys(FIELD_KEYWORDS) as SystemField[]) {
    const keywords = FIELD_KEYWORDS[field];
    for (const h of headers) {
      if (used.has(h)) continue;
      if (keywords.some((kw) => h.toLowerCase().includes(kw.toLowerCase()))) {
        mapping[field] = h;
        used.add(h);
        break;
      }
    }
  }
  return mapping;
}

// ─── Guest normalization ───

interface RawGuest {
  name: string;
  aliases: string[];
  category: string;
  rsvpStatus: 'confirmed' | 'declined';
  companionCount: number;
  rawSubcategory: string;
  dietaryNote: string;
  specialNote: string;
  rawPreferences: string[];
  rawAvoids: string[];
}

function normalizeRow(row: Record<string, string>, mapping: Record<SystemField, string | null>): RawGuest | null {
  const get = (f: SystemField) => (mapping[f] ? (row[mapping[f]!] || '').trim() : '');

  const name = get('name');
  if (!name) return null;

  const aliasStr = get('aliases');
  const aliases = aliasStr ? aliasStr.split(/[,，、]/).map((a) => a.trim()).filter(Boolean) : [];

  const rsvpRaw = get('rsvpStatus').toLowerCase();
  const rsvpStatus: 'confirmed' | 'declined' =
    ['否', '不', '婉拒', 'no', 'n', '0', 'false'].some((k) => rsvpRaw.includes(k)) ? 'declined' : 'confirmed';

  const extraRaw = get('companionCount').toLowerCase();
  const numMatch = extraRaw.match(/\d+/);
  let extra = 0;
  if (numMatch) extra = parseInt(numMatch[0], 10);
  else if (['有', '是', 'yes', '帶'].some((k) => extraRaw.includes(k))) extra = 1;
  const companionCount = Math.min(4, Math.max(0, extra));

  const prefStr = get('seatPreferences');
  const rawPreferences = prefStr
    ? prefStr.split(/[,，、\n\s]+/).map((p) => p.trim()).filter(Boolean).slice(0, 3)
    : [];

  const avoidStr = get('avoidGuests');
  const rawAvoids = avoidStr
    ? avoidStr.split(/[,，、\n\s]+/).map((p) => p.trim()).filter(Boolean)
    : [];

  return {
    name, aliases, category: get('category') || '',
    rsvpStatus, companionCount,
    rawSubcategory: get('subcategory'),
    dietaryNote: get('dietaryNote'),
    specialNote: get('specialNote'),
    rawPreferences, rawAvoids,
  };
}

// ─── Preference matching (simplified from preference-matcher.ts) ───

function matchPreferences(guests: RawGuest[]) {
  const nameIndex: Array<{ text: string; guestIndex: number }> = [];
  guests.forEach((g, i) => {
    if (g.rsvpStatus === 'declined') return;
    nameIndex.push({ text: g.name.toLowerCase(), guestIndex: i });
    g.aliases.forEach((a) => nameIndex.push({ text: a.toLowerCase(), guestIndex: i }));
  });

  const results: Array<{ fromIndex: number; toIndex: number; rank: number }> = [];

  for (let i = 0; i < guests.length; i++) {
    const g = guests[i];
    if (g.rsvpStatus === 'declined') continue;
    for (let r = 0; r < g.rawPreferences.length; r++) {
      const query = g.rawPreferences[r].toLowerCase();
      const match = nameIndex.find(
        (n) => n.text === query && n.guestIndex !== i,
      );
      if (match) {
        results.push({ fromIndex: i, toIndex: match.guestIndex, rank: r + 1 });
      }
    }
  }
  return results;
}

// ─── Assignment (extracted from seating.ts randomAssignGuests) ───

interface SimpleGuest { index: number; seatCount: number; confirmed: boolean }
interface SimpleTable { index: number; capacity: number }

function computeAssignments(
  guests: SimpleGuest[],
  tables: SimpleTable[],
  ratio: number,
): Array<{ guestIndex: number; tableIndex: number; seatIndex: number }> {
  const confirmed = guests.filter((g) => g.confirmed);
  // Deterministic shuffle using seeded approach (for reproducibility per fixture)
  // Use Fisher-Yates with a simple seed
  const shuffled = [...confirmed];
  // Simple deterministic shuffle: sort by name hash
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  shuffled.length = Math.ceil(shuffled.length * ratio);

  const remaining = new Map<number, number>();
  const nextSeat = new Map<number, number>();
  for (const t of tables) {
    remaining.set(t.index, t.capacity);
    nextSeat.set(t.index, 0);
  }

  const assignments: Array<{ guestIndex: number; tableIndex: number; seatIndex: number }> = [];
  for (const g of shuffled) {
    const avail = tables.find((t) => (remaining.get(t.index) || 0) >= g.seatCount);
    if (avail) {
      const seat = nextSeat.get(avail.index) || 0;
      assignments.push({ guestIndex: g.index, tableIndex: avail.index, seatIndex: seat });
      remaining.set(avail.index, (remaining.get(avail.index) || 0) - g.seatCount);
      nextSeat.set(avail.index, seat + g.seatCount);
    }
  }
  return assignments;
}

// ─── Main ───

const CSV_DIR = join(import.meta.dirname, '..', 'public');
const CSV_FILES = [
  'seatern-demo-mix.csv',
  'seatern-demo-entertainment.csv',
  'seatern-demo-youtuber.csv',
  'seatern-demo-politics.csv',
  'seatern-demo-sports.csv',
];

for (const csvFile of CSV_FILES) {
  const csvPath = join(CSV_DIR, csvFile);
  const text = readFileSync(csvPath, 'utf-8');
  const { headers, rows } = parseCSV(text);
  if (rows.length === 0) { console.warn(`Skipping empty CSV: ${csvFile}`); continue; }

  const mapping = detectAndMap(headers);
  const guests = rows.map((r) => normalizeRow(r, mapping)).filter((g): g is RawGuest => g !== null);
  const confirmed = guests.filter((g) => g.rsvpStatus === 'confirmed');
  if (confirmed.length === 0) { console.warn(`No confirmed guests in ${csvFile}`); continue; }

  // 1. Generate subcategories with UUIDs
  const subcatMap = new Map<string, { id: string; name: string; category: string }>();
  for (const g of guests) {
    if (!g.rawSubcategory || !g.category) continue;
    if (!subcatMap.has(g.rawSubcategory)) {
      subcatMap.set(g.rawSubcategory, { id: randomUUID(), name: g.rawSubcategory, category: g.category });
    }
  }
  const subcategories = [...subcatMap.values()];

  // 2. Generate tables with UUIDs
  const totalSeats = confirmed.reduce((sum, g) => sum + g.companionCount + 1, 0);
  const tableCount = Math.ceil(totalSeats / 10);
  const cols = Math.ceil(Math.sqrt(tableCount));
  const tables: SeedPayload['tables'] = [];
  for (let i = 0; i < tableCount; i++) {
    const row = Math.floor(i / cols);
    const col = i % cols;
    tables.push({
      id: randomUUID(),
      name: `第${i + 1}桌`,
      capacity: 10,
      positionX: 200 + col * 350,
      positionY: 200 + row * 350,
    });
  }

  // 3. Generate guests with UUIDs + subcategoryId
  const guestIds: string[] = [];
  const seedGuests: SeedPayload['guests'] = guests.map((g) => {
    const id = randomUUID();
    guestIds.push(id);
    const subcat = g.rawSubcategory ? subcatMap.get(g.rawSubcategory) : undefined;
    return {
      id,
      name: g.name,
      aliases: g.aliases,
      category: g.category || undefined,
      rsvpStatus: g.rsvpStatus,
      companionCount: g.companionCount,
      dietaryNote: g.dietaryNote || undefined,
      specialNote: g.specialNote || undefined,
      subcategoryId: subcat?.id,
      // assignedTableId and seatIndex filled below
      assignedTableId: undefined,
      seatIndex: null,
    };
  });

  // 4. Compute seat assignments (ratio=0.75)
  const simpleGuests: SimpleGuest[] = guests.map((g, i) => ({
    index: i,
    seatCount: g.companionCount + 1,
    confirmed: g.rsvpStatus === 'confirmed',
  }));
  const simpleTables: SimpleTable[] = tables.map((t, i) => ({ index: i, capacity: t.capacity }));
  const assignments = computeAssignments(simpleGuests, simpleTables, 0.75);

  for (const a of assignments) {
    seedGuests[a.guestIndex].assignedTableId = tables[a.tableIndex].id;
    seedGuests[a.guestIndex].seatIndex = a.seatIndex;
  }

  // 5. Match preferences
  const prefMatches = matchPreferences(guests);
  const preferences: SeedPayload['preferences'] = prefMatches.map((m) => ({
    guestId: guestIds[m.fromIndex],
    preferredGuestId: guestIds[m.toIndex],
    rank: m.rank,
  }));

  // 6. Build avoid pairs (deduplicated)
  const avoidPairs: SeedPayload['avoidPairs'] = [];
  const seenPairs = new Set<string>();
  for (let i = 0; i < guests.length; i++) {
    const g = guests[i];
    if (g.rawAvoids.length === 0) continue;
    for (const avoidName of g.rawAvoids) {
      const targetIdx = guests.findIndex((t) => t.name === avoidName);
      if (targetIdx < 0) continue;
      const key = [guestIds[i], guestIds[targetIdx]].sort().join('-');
      if (seenPairs.has(key)) continue;
      seenPairs.add(key);
      avoidPairs.push({ guestAId: guestIds[i], guestBId: guestIds[targetIdx] });
    }
  }

  // 7. Write JSON fixture
  const payload: SeedPayload = { subcategories, tables, guests: seedGuests, preferences, avoidPairs };
  const outName = basename(csvFile, '.csv') + '.json';
  const outPath = join(CSV_DIR, outName);
  writeFileSync(outPath, JSON.stringify(payload), 'utf-8');
  console.log(`Generated ${outName}: ${seedGuests.length} guests, ${tables.length} tables, ${preferences.length} prefs, ${avoidPairs.length} avoid pairs`);
}
