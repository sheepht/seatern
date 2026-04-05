// ─── 快照對比統計 ──────────────────────────────────
//
// snapshot.data.guests[]  ──→ computeSnapshotStats()
//   { tableId, satisfactionScore }         │
//                                          ▼
// store.guests[] + tables[] ──→ computeCurrentStats()
//                                          │
//                                          ▼
//                                 SnapshotCompareStats
//                                 { assigned, total, tableCount,
//                                   average, green, yellow, orange, red }
//                                          │
//                                          ▼
//                                 Toolbar restore modal
//                                 (side-by-side comparison)

import type { Guest, Table } from '@/stores/seating';

export interface SnapshotCompareStats {
  assigned: number
  total: number
  tableCount: number
  average: number
  overflowCount: number
  green: number
  yellow: number
  orange: number
  red: number
}

const EMPTY_STATS: SnapshotCompareStats = {
  assigned: 0,
  total: 0,
  tableCount: 0,
  average: 0,
  overflowCount: 0,
  green: 0,
  yellow: 0,
  orange: 0,
  red: 0,
};

interface SnapshotGuestEntry {
  guestId: string
  tableId: string | null
  satisfactionScore?: number
  isOverflow?: boolean
}

interface SnapshotTableEntry {
  tableId: string
  name?: string
  positionX: number
  positionY: number
}

interface SnapshotData {
  guests?: SnapshotGuestEntry[]
  tables?: SnapshotTableEntry[]
}

function classifyScore(score: number) {
  if (score >= 75) return 'green' as const;
  if (score >= 50) return 'yellow' as const;
  if (score >= 25) return 'orange' as const;
  return 'red' as const;
}

/** 從 snapshot.data 計算統計（快照側） */
export function computeSnapshotStats(data: unknown, averageSatisfaction?: number): SnapshotCompareStats {
  if (!data || typeof data !== 'object') return { ...EMPTY_STATS };

  const snapData = data as SnapshotData;
  const guests = snapData.guests;
  if (!Array.isArray(guests)) return { ...EMPTY_STATS };

  const tables = snapData.tables;
  const total = guests.length;
  const assigned = guests.filter((g) => g.tableId != null).length;
  const tableCount = Array.isArray(tables) ? tables.length : 0;

  // 分佈：只算已入座且有 satisfactionScore 的
  const seated = guests.filter((g) => g.tableId != null && typeof g.satisfactionScore === 'number');
  const counts = { green: 0, yellow: 0, orange: 0, red: 0 };
  for (const g of seated) {
    counts[classifyScore(g.satisfactionScore!)]++;
  }

  // 平均：優先用預算好的 averageSatisfaction，fallback 自己算
  let average = 0;
  if (typeof averageSatisfaction === 'number' && averageSatisfaction > 0) {
    average = averageSatisfaction;
  } else if (seated.length > 0) {
    average = Math.round((seated.reduce((s, g) => s + g.satisfactionScore!, 0) / seated.length) * 10) / 10;
  }

  const overflowCount = guests.filter((g) => g.tableId != null && g.isOverflow === true).length;

  return { assigned, total, tableCount, average, overflowCount, ...counts };
}

/** 從目前 store 狀態計算統計（目前側） */
export function computeCurrentStats(guests: Guest[], tables: Table[]): SnapshotCompareStats {
  const confirmed = guests.filter((g) => g.rsvpStatus === 'confirmed');
  const total = confirmed.length;
  const seated = confirmed.filter((g) => g.assignedTableId != null);
  const assigned = seated.length;
  const tableCount = tables.length;

  const counts = { green: 0, yellow: 0, orange: 0, red: 0 };
  for (const g of seated) {
    counts[classifyScore(g.satisfactionScore)]++;
  }

  const average = seated.length > 0
    ? Math.round((seated.reduce((s, g) => s + g.satisfactionScore, 0) / seated.length) * 10) / 10
    : 0;

  const overflowCount = seated.filter((g) => g.isOverflow).length;

  return { assigned, total, tableCount, average, overflowCount, ...counts };
}
