// 本檔案是 landing page 專用的簡化版滿意度計算。
// 真實計算在 packages/api/src/routes/events.ts。
// 如果公式變了，這裡要同步改，但分數不需要 100% 吻合 —
// 這只是給訪客看的 demo，數字大致對就好。

export type GuestGroup = 'bride' | 'groom' | 'shared';

export interface DemoGuest {
  id: string;
  name: string;
  group: GuestGroup;
  mutualPrefs: string[];
}

export interface DemoTable {
  id: string;
  name: string;
  capacity: number;
  guestIds: string[];
}

export interface DemoState {
  guests: Record<string, DemoGuest>;
  tables: Record<string, DemoTable>;
}

export interface DemoScoreResult {
  perGuest: Record<string, number>;
  tableAvg: Record<string, number>;
}

const BASE = 50;
const BASELINE_EMPTY = 50;
const GROUP_HIGH = 25;
const GROUP_MID = 12;
const PREF_EACH = 12;
const PREF_CAP = 25;

function safe(n: number): number {
  return Number.isFinite(n) ? n : BASE;
}

function computeGuestScore(
  guest: DemoGuest,
  table: DemoTable,
  state: DemoState,
): number {
  const tableGuests = table.guestIds
    .map((id) => state.guests[id])
    .filter((g): g is DemoGuest => !!g);

  if (tableGuests.length === 0) return BASE;

  // 群組分：排除自己後計算同 group 比例
  const otherGuests = tableGuests.filter((g) => g.id !== guest.id);
  const otherCount = Math.max(otherGuests.length, 1);
  const sameGroupCount = otherGuests.filter((g) => g.group === guest.group).length;
  const sameGroupRatio = sameGroupCount / otherCount;

  let groupScore = 0;
  if (otherGuests.length > 0) {
    if (sameGroupRatio >= 0.5) groupScore = GROUP_HIGH;
    else if (sameGroupRatio >= 0.25) groupScore = GROUP_MID;
  }

  // 偏好分：每個 mutualPref 在同桌 → +12，上限 25
  const prefsInTable = guest.mutualPrefs.filter((prefId) =>
    table.guestIds.includes(prefId),
  ).length;
  const prefScore = Math.min(prefsInTable * PREF_EACH, PREF_CAP);

  return safe(BASE + groupScore + prefScore);
}

export function demoScorer(state: DemoState): DemoScoreResult {
  const perGuest: Record<string, number> = {};
  const tableAvg: Record<string, number> = {};

  for (const table of Object.values(state.tables)) {
    if (table.guestIds.length === 0) {
      tableAvg[table.id] = BASELINE_EMPTY;
      continue;
    }

    let sum = 0;
    let counted = 0;
    for (const guestId of table.guestIds) {
      const guest = state.guests[guestId];
      if (!guest) continue;
      const score = computeGuestScore(guest, table, state);
      perGuest[guestId] = score;
      sum += score;
      counted += 1;
    }
    const avg = counted > 0 ? safe(Math.round(sum / counted)) : BASELINE_EMPTY;
    tableAvg[table.id] = avg;
  }

  return { perGuest, tableAvg };
}

export function moveGuest(
  state: DemoState,
  guestId: string,
  toTableId: string,
): DemoState {
  if (!state.guests[guestId]) return state;

  const target = state.tables[toTableId];
  if (!target) return state;

  const source = Object.values(state.tables).find((t) =>
    t.guestIds.includes(guestId),
  );
  if (!source) return state;

  if (source.id === toTableId) return state;
  if (target.guestIds.length >= target.capacity) return state;

  const nextTables: Record<string, DemoTable> = { ...state.tables };
  nextTables[source.id] = {
    ...source,
    guestIds: source.guestIds.filter((id) => id !== guestId),
  };
  nextTables[toTableId] = {
    ...target,
    guestIds: [...target.guestIds, guestId],
  };

  return { ...state, tables: nextTables };
}
