const DEMO_LOADED_KEY = 'seatern-demo-loaded';

export function hasDemoLoaded(): boolean {
  return localStorage.getItem(DEMO_LOADED_KEY) === '1';
}

export function resetDemoFlag(): void {
  localStorage.removeItem(DEMO_LOADED_KEY);
}

import { parseCSV } from './csv-parser';
import { detectColumns, normalizeGuest, type RawGuest } from './column-detector';
import { matchAllPreferences } from './preference-matcher';
import { api } from './api';
import { useSeatingStore } from '@/stores/seating';
import type { CreatedGuest, CreateGuestPayload, SubcategoryBatchPayload, AvoidPairBatchPayload, CreateTablePayload } from './types';

/**
 * 為未登入的新使用者載入範例資料：
 * 1. 抓取 seatern-template.csv
 * 2. 解析 + 匯入賓客、偏好、子分類、避免同桌
 * 3. 自動補桌
 * 4. 重新載入 store
 * 5. 執行隨機排桌（100% 賓客全排進去）
 */
export async function loadDemoData(eventId: string): Promise<void> {
  localStorage.setItem(DEMO_LOADED_KEY, '1');

  // 1. 隨機挑選一個範本 CSV
  const DEMO_TEMPLATES = [
    '/seatern-demo-mix.csv',
    '/seatern-demo-entertainment.csv',
    '/seatern-demo-youtuber.csv',
    '/seatern-demo-politics.csv',
    '/seatern-demo-sports.csv',
  ];
  const template = DEMO_TEMPLATES[Math.floor(Math.random() * DEMO_TEMPLATES.length)];
  const res = await fetch(template);
  if (!res.ok) return;
  const text = await res.text();
  const { headers, rows } = parseCSV(text);
  if (rows.length === 0) return;

  // 2. 偵測欄位 + 正規化賓客
  const { mapping, multiMapping } = detectColumns(headers);
  const guests = rows
    .map((row) => normalizeGuest(row, mapping, multiMapping))
    .filter((g): g is RawGuest => g !== null);

  const confirmed = guests.filter((g) => g.rsvpStatus === 'confirmed');
  if (confirmed.length === 0) return;

  // 3. 批次匯入賓客
  const payload: CreateGuestPayload[] = guests.map((g) => ({
    name: g.name,
    aliases: g.aliases,
    category: g.category || undefined,
    rsvpStatus: g.rsvpStatus,
    companionCount: g.companionCount,
    dietaryNote: g.dietaryNote || undefined,
    specialNote: g.specialNote || undefined,
  }));
  const guestRes = await api.post(`/api/events/${eventId}/guests/batch`, { guests: payload });
  const { guests: createdGuests } = guestRes.data;

  // 4. 建立座位偏好
  const prefMatches = matchAllPreferences(guests);
  const validPrefs = prefMatches.filter((m) => m.selectedIndex !== null && m.selectedIndex >= 0);
  if (validPrefs.length > 0) {
    const nameToId = new Map<string, string>();
    createdGuests.forEach((g: CreatedGuest) => nameToId.set(g.name.trim().toLowerCase(), g.id));

    const preferences = validPrefs
      .map((m) => {
        const fromId = createdGuests[m.fromIndex]?.id;
        const preferredName = m.candidates.find((c) => c.guestIndex === m.selectedIndex)?.name;
        const preferredId = preferredName ? nameToId.get(preferredName.trim().toLowerCase()) : undefined;
        if (!fromId || !preferredId) return null;
        return { guestId: fromId, preferredGuestId: preferredId, rank: m.rank };
      })
      .filter((p): p is NonNullable<typeof p> => p !== null);

    if (preferences.length > 0) {
      await api.post(`/api/events/${eventId}/preferences/batch`, { preferences });
    }
  }

  // 5. 建立子分類
  const subcatAssignments: SubcategoryBatchPayload['assignments'] = [];
  guests.forEach((g, i) => {
    if (!g.rawSubcategory || !g.category) return;
    const guestId = createdGuests[i]?.id;
    if (!guestId) return;
    subcatAssignments.push({ guestId, subcategoryName: g.rawSubcategory, category: g.category });
  });
  if (subcatAssignments.length > 0) {
    await api.post(`/api/events/${eventId}/subcategories/batch`, { assignments: subcatAssignments });
  }

  // 6. 建立避免同桌
  const avoidPairs: AvoidPairBatchPayload['pairs'] = [];
  const seenAvoidPairs = new Set<string>();
  guests.forEach((g, i) => {
    if (g.rawAvoids.length === 0) return;
    const guestAId = createdGuests[i]?.id;
    if (!guestAId) return;
    for (const avoidName of g.rawAvoids) {
      const targetIdx = guests.findIndex((t) => t.name === avoidName);
      if (targetIdx < 0) continue;
      const guestBId = createdGuests[targetIdx]?.id;
      if (!guestBId) continue;
      const key = [guestAId, guestBId].sort().join('-');
      if (seenAvoidPairs.has(key)) continue;
      seenAvoidPairs.add(key);
      avoidPairs.push({ guestAId, guestBId });
    }
  });
  if (avoidPairs.length > 0) {
    await api.post(`/api/events/${eventId}/avoid-pairs/batch`, { pairs: avoidPairs });
  }

  // 7. 自動補桌次
  const totalSeats = confirmed.reduce((sum, g) => sum + g.companionCount + 1, 0);
  const tableCount = Math.ceil(totalSeats / 10);
  const cols = Math.ceil(Math.sqrt(tableCount));
  for (let i = 0; i < tableCount; i++) {
    const row = Math.floor(i / cols);
    const col = i % cols;
    await api.post(`/api/events/${eventId}/tables`, {
      name: `第${i + 1}桌`,
      capacity: 10,
      positionX: 200 + col * 350,
      positionY: 200 + row * 350,
    } satisfies CreateTablePayload);
  }

  // 8. 重新載入 store + 隨機排桌（100% 全排進去）
  await useSeatingStore.getState().loadEvent();
  useSeatingStore.getState().randomAssignGuests();
}
