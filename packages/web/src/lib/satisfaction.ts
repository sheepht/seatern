/**
 * 滿意度計算引擎（純函式）
 *
 * 公式：個人滿意度 = 50（基礎）+ 群組分（0-20）+ 偏好分（0-25）+ 需求分（固定 +5）
 * 權威來源：PRD（CLAUDE.md）§3.4
 */

import type { Guest, Table, AvoidPair } from './types';

// ─── 群組分（0-20）──────────────────────────────────
// 同桌有同群組的人佔比

export function calculateGroupScore(
  guest: Guest,
  tableGuests: Guest[],
  allGuests: Guest[] = [],
  tables: Table[] = [],
): number {
  const guestSubcat = guest.subcategory?.name;
  if (!guestSubcat) return 0;

  const others = tableGuests.filter((g) => g.id !== guest.id);

  const sameGroupCount = others.filter(
    (other) => other.subcategory?.name === guestSubcat,
  ).length;

  // 同桌群組比例基礎分
  let base = 0;
  if (others.length > 0) {
    const ratio = sameGroupCount / others.length;
    if (ratio >= 0.5) base = 20;
    else if (ratio >= 0.3) base = 15;
    else if (ratio >= 0.1) base = 10;
    else if (sameGroupCount >= 1) base = 5;
  }

  // 鄰桌同子分類補償：同群組的人在鄰桌 → +5（溢出安排補償）
  if (base < 20 && guest.assignedTableId && tables.length > 0) {
    const currentTable = tables.find((t) => t.id === guest.assignedTableId);
    if (currentTable) {
      const hasNeighborGroup = allGuests.some((g) => {
        if (g.id === guest.id || g.assignedTableId === guest.assignedTableId) return false;
        if (g.subcategory?.name !== guestSubcat) return false;
        if (g.rsvpStatus !== 'confirmed' || !g.assignedTableId) return false;
        const gTable = tables.find((t) => t.id === g.assignedTableId);
        return gTable ? isNeighborTable(currentTable, gTable) : false;
      });
      if (hasNeighborGroup) base = Math.min(20, base + 5);
    }
  }

  return base;
}

// ─── 偏好分（0-25）──────────────────────────────────
// 想同桌的人配對成功數

export function calculatePreferenceScore(
  guest: Guest,
  tableGuests: Guest[],
  allGuests: Guest[],
  tables: Table[],
): number {
  if (guest.seatPreferences.length === 0) return 0;

  const tableGuestIds = new Set(tableGuests.map((g) => g.id));
  const preferredIds = guest.seatPreferences.map((p) => p.preferredGuestId);

  const matchedCount = preferredIds.filter((id) => tableGuestIds.has(id)).length;
  const totalPrefs = preferredIds.length;

  // 同桌配對基礎分
  let base = 0;
  if (totalPrefs >= 3 && matchedCount >= 3) base = 25;
  else if (matchedCount >= 2) base = 18;
  else if (matchedCount >= 1) base = 10;

  // 鄰桌加分：每位想同桌的人在鄰桌 +3（與同桌配對疊加，總分上限 25）
  if (base < 25 && guest.assignedTableId) {
    const currentTable = tables.find((t) => t.id === guest.assignedTableId);
    if (currentTable) {
      let neighborBonus = 0;
      for (const prefId of preferredIds) {
        if (tableGuestIds.has(prefId)) continue; // 已在同桌，不重複計算
        const prefGuest = allGuests.find((g) => g.id === prefId);
        if (!prefGuest?.assignedTableId || prefGuest.assignedTableId === guest.assignedTableId) continue;
        const prefTable = tables.find((t) => t.id === prefGuest.assignedTableId);
        if (prefTable && isNeighborTable(currentTable, prefTable)) neighborBonus += 3;
      }
      base = Math.min(25, base + neighborBonus);
    }
  }

  return base;
}

// ─── 鄰桌判定 ───────────────────────────────────────
// 邏輯座標，閾值 = 桌次直徑的 2 倍（約 450 邏輯單位）

const NEIGHBOR_THRESHOLD = 450;

export function isNeighborTable(a: Table, b: Table): boolean {
  const dx = a.positionX - b.positionX;
  const dy = a.positionY - b.positionY;
  const distance = Math.sqrt(dx * dx + dy * dy);
  return distance <= NEIGHBOR_THRESHOLD;
}

// ─── 避免同桌懲罰（每個衝突 -20，最低 0）───────────────

const AVOID_PENALTY = 60;

export function calculateAvoidPenalty(
  guest: Guest,
  tableGuests: Guest[],
  avoidPairs: AvoidPair[],
): number {
  const tableGuestIds = new Set(tableGuests.filter((g) => g.id !== guest.id).map((g) => g.id));
  const violations = avoidPairs.filter(
    (ap) =>
      (ap.guestAId === guest.id && tableGuestIds.has(ap.guestBId)) ||
      (ap.guestBId === guest.id && tableGuestIds.has(ap.guestAId)),
  );
  return violations.length * AVOID_PENALTY;
}

// ─── 個人滿意度 ─────────────────────────────────────

export function calculateSatisfaction(
  guest: Guest,
  allGuests: Guest[],
  tables: Table[],
  avoidPairs: AvoidPair[] = [],
): number {
  // 婉拒的不計算
  if (guest.rsvpStatus === 'declined') return 0;

  // 未分配的：基礎分 + 需求分
  if (!guest.assignedTableId) return 55;

  const tableGuests = allGuests.filter(
    (g) => g.assignedTableId === guest.assignedTableId && g.rsvpStatus === 'confirmed',
  );

  const base = 50;
  const groupScore = calculateGroupScore(guest, tableGuests, allGuests, tables);
  const prefScore = calculatePreferenceScore(guest, tableGuests, allGuests, tables);
  const needsScore = 5; // 固定 +5
  const avoidPenalty = calculateAvoidPenalty(guest, tableGuests, avoidPairs);

  return Math.max(0, base + groupScore + prefScore + needsScore - avoidPenalty);
}

// ─── 桌次平均滿意度 ─────────────────────────────────

export function calculateTableAverage(
  tableId: string,
  allGuests: Guest[],
  tables: Table[],
  avoidPairs: AvoidPair[] = [],
): number {
  const tableGuests = allGuests.filter(
    (g) => g.assignedTableId === tableId && g.rsvpStatus === 'confirmed',
  );
  if (tableGuests.length === 0) return 0;

  const total = tableGuests.reduce(
    (sum, g) => sum + calculateSatisfaction(g, allGuests, tables, avoidPairs),
    0,
  );
  return Math.round((total / tableGuests.length) * 10) / 10;
}

// ─── 全量重算 ───────────────────────────────────────
// 每次移動賓客後呼叫，重算所有人的滿意度

export interface RecalcResult {
  guests: Array<{ id: string; satisfactionScore: number }>
  tables: Array<{ id: string; averageSatisfaction: number }>
  overallAverage: number
}

export function recalculateAll(
  guests: Guest[],
  tables: Table[],
  avoidPairs: AvoidPair[] = [],
): RecalcResult {
  const confirmed = guests.filter((g) => g.rsvpStatus === 'confirmed');

  const guestScores = confirmed.map((g) => ({
    id: g.id,
    satisfactionScore: calculateSatisfaction(g, guests, tables, avoidPairs),
  }));

  const tableScores = tables.map((t) => ({
    id: t.id,
    averageSatisfaction: calculateTableAverage(t.id, guests, tables, avoidPairs),
  }));

  const assignedScores = guestScores.filter((g) => {
    const guest = guests.find((gg) => gg.id === g.id);
    return guest?.assignedTableId != null;
  });

  const overallAverage =
    assignedScores.length > 0
      ? Math.round(
          (assignedScores.reduce((s, g) => s + g.satisfactionScore, 0) / assignedScores.length) * 10,
        ) / 10
      : 0;

  return { guests: guestScores, tables: tableScores, overallAverage };
}

// ─── 滿意度 delta 顯示值（> 0.1 至少 ±1）─────────────

export function formatScoreDelta(rawDelta: number): number {
  if (rawDelta > 0.1) return Math.max(1, Math.round(rawDelta));
  if (rawDelta < -0.1) return Math.min(-1, Math.round(rawDelta));
  return 0;
}

// ─── 滿意度顏色 ──────────────────────────────────────
// >= 75 綠、>= 50 黃、>= 25 橘、< 25 紅

export function getSatisfactionColor(score: number): string {
  if (score >= 75) return '#16A34A';
  if (score >= 50) return '#CA8A04';
  if (score >= 25) return '#EA580C';
  return '#DC2626';
}
