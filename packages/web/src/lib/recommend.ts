/**
 * 推薦引擎：為每張桌計算哪些待排賓客適合加入
 *
 * 做法：模擬將待排賓客放入某桌，計算預估滿意度。
 * 預估 >= 70 的賓客視為「推薦」。
 */

import type { Guest, Table, AvoidPair } from './types';
import { calculateSatisfaction } from './satisfaction';

export interface TableRecommendation {
  tableId: string
  /** 推薦的賓客 ID，按預估滿意度降序排列 */
  guests: Array<{ guestId: string; predictedScore: number; reason: string }>
}

/**
 * 計算每張桌的推薦賓客
 */
export function getTableRecommendations(
  tables: Table[],
  allGuests: Guest[],
  avoidPairs: AvoidPair[],
  threshold = 70,
): TableRecommendation[] {
  const unassigned = allGuests.filter((g) => !g.assignedTableId && g.rsvpStatus === 'confirmed');
  if (unassigned.length === 0) return [];

  return tables.map((table) => {
    const tableGuests = allGuests.filter(
      (g) => g.assignedTableId === table.id && g.rsvpStatus === 'confirmed',
    );
    const seatCount = tableGuests.reduce((s, g) => s + g.seatCount, 0);
    const remaining = table.capacity - seatCount;
    if (remaining <= 0) return { tableId: table.id, guests: [] };

    const candidates: TableRecommendation['guests'] = [];

    for (const guest of unassigned) {
      if (guest.seatCount > remaining) continue;

      // Check avoid pair conflict
      const hasConflict = avoidPairs.some((ap) => {
        const isInvolved = ap.guestAId === guest.id || ap.guestBId === guest.id;
        if (!isInvolved) return false;
        const otherId = ap.guestAId === guest.id ? ap.guestBId : ap.guestAId;
        return tableGuests.some((tg) => tg.id === otherId);
      });
      if (hasConflict) continue;

      // Simulate: temporarily assign guest to this table
      const simGuest = { ...guest, assignedTableId: table.id };
      const simAllGuests = allGuests.map((g) => (g.id === guest.id ? simGuest : g));
      const predictedScore = calculateSatisfaction(simGuest, simAllGuests, tables, avoidPairs);

      if (predictedScore >= threshold) {
        // Generate reason
        const reason = getRecommendReason(guest, tableGuests);
        candidates.push({ guestId: guest.id, predictedScore, reason });
      }
    }

    candidates.sort((a, b) => b.predictedScore - a.predictedScore);
    return { tableId: table.id, guests: candidates };
  });
}

/**
 * 為單一賓客推薦最佳桌次（無腦排位用）
 */
export function getGuestRecommendations(
  guest: Guest,
  tables: Table[],
  allGuests: Guest[],
  avoidPairs: AvoidPair[],
  topN = 3,
): Array<{ tableId: string; tableName: string; predictedScore: number; reason: string }> {
  const results: Array<{ tableId: string; tableName: string; predictedScore: number; reason: string }> = [];

  for (const table of tables) {
    const tableGuests = allGuests.filter(
      (g) => g.assignedTableId === table.id && g.rsvpStatus === 'confirmed',
    );
    const seatCount = tableGuests.reduce((s, g) => s + g.seatCount, 0);
    if (guest.seatCount > table.capacity - seatCount) continue;

    // Check avoid pair conflict
    const hasConflict = avoidPairs.some((ap) => {
      const isInvolved = ap.guestAId === guest.id || ap.guestBId === guest.id;
      if (!isInvolved) return false;
      const otherId = ap.guestAId === guest.id ? ap.guestBId : ap.guestAId;
      return tableGuests.some((tg) => tg.id === otherId);
    });
    if (hasConflict) continue;

    const simGuest = { ...guest, assignedTableId: table.id };
    const simAllGuests = allGuests.map((g) => (g.id === guest.id ? simGuest : g));
    const predictedScore = calculateSatisfaction(simGuest, simAllGuests, tables, avoidPairs);
    const reason = getRecommendReason(guest, tableGuests);

    results.push({ tableId: table.id, tableName: table.name, predictedScore, reason });
  }

  results.sort((a, b) => b.predictedScore - a.predictedScore);
  return results.slice(0, topN);
}

function getRecommendReason(guest: Guest, tableGuests: Guest[]): string {
  // Check seat preference match
  const prefIds = new Set(guest.seatPreferences.map((p) => p.preferredGuestId));
  const prefMatches = tableGuests.filter((g) => prefIds.has(g.id));
  if (prefMatches.length > 0) {
    const names = prefMatches.map((g) => g.aliases[0] || g.name).join('、');
    return `想跟${names}同桌`;
  }

  // Check subcategory match
  if (guest.subcategory?.name) {
    const sameSubcat = tableGuests.filter((g) => g.subcategory?.name === guest.subcategory?.name);
    if (sameSubcat.length > 0) {
      return `同${guest.subcategory.name}`;
    }
  }

  // Check category match
  if (guest.category) {
    const sameCat = tableGuests.filter((g) => g.category === guest.category);
    if (sameCat.length > 0) {
      return `同${guest.category}賓客`;
    }
  }

  return '有空位';
}
