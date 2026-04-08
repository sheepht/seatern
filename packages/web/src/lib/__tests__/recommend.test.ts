import { describe, it, expect, beforeEach } from 'vitest';
import { getTableRecommendations, getGuestRecommendations } from '../recommend';
import type { Guest, Table, AvoidPair } from '../types';

let _id = 0;
function uid() { return `id-${++_id}`; }

function makeGuest(overrides: Partial<Guest> = {}): Guest {
  const id = overrides.id ?? uid();
  return {
    id,
    name: overrides.name ?? `賓客${id}`,
    aliases: [],
    category: '男方',
    rsvpStatus: 'confirmed',
    companionCount: 0,
    seatCount: 1,
    dietaryNote: '',
    specialNote: '',
    satisfactionScore: 0,
    assignedTableId: null,
    seatIndex: null,
    isOverflow: false,
    isIsolated: false,
    seatPreferences: [],
    subcategory: null,
    ...overrides,
  };
}

function makeTable(overrides: Partial<Table> = {}): Table {
  const id = overrides.id ?? uid();
  return {
    id,
    name: overrides.name ?? `第${id}桌`,
    capacity: 10,
    positionX: 0,
    positionY: 0,
    averageSatisfaction: 0,
    color: null,
    note: null,
    ...overrides,
  };
}

beforeEach(() => { _id = 0; });

describe('getTableRecommendations', () => {
  it('沒有未分配賓客 → 空推薦', () => {
    const table = makeTable({ id: 't1' });
    const guest = makeGuest({ id: 'g1', assignedTableId: 't1' });
    const result = getTableRecommendations([table], [guest], []);
    expect(result).toEqual([]);
  });

  it('推薦同子分類的賓客', () => {
    const subcat = { id: 's1', name: '大學同學' };
    const table = makeTable({ id: 't1' });
    const seated = makeGuest({ id: 'g1', assignedTableId: 't1', subcategory: subcat });
    const unassigned = makeGuest({ id: 'g2', subcategory: subcat });
    const allGuests = [seated, unassigned];

    const result = getTableRecommendations([table], allGuests, [], 50);
    expect(result).toHaveLength(1);
    expect(result[0].guests.length).toBeGreaterThanOrEqual(1);
    expect(result[0].guests[0].guestId).toBe('g2');
  });

  it('跳過會違反避免同桌的賓客', () => {
    const table = makeTable({ id: 't1' });
    const seated = makeGuest({ id: 'g1', assignedTableId: 't1' });
    const unassigned = makeGuest({ id: 'g2' });
    const avoidPairs: AvoidPair[] = [{ id: 'ap1', guestAId: 'g1', guestBId: 'g2', reason: '' }];

    const result = getTableRecommendations([table], [seated, unassigned], avoidPairs, 0);
    const tableRec = result.find((r) => r.tableId === 't1');
    const hasConflictGuest = tableRec?.guests.some((g) => g.guestId === 'g2');
    expect(hasConflictGuest).toBeFalsy();
  });

  it('跳過沒有剩餘容量的桌子', () => {
    const table = makeTable({ id: 't1', capacity: 1 });
    const seated = makeGuest({ id: 'g1', assignedTableId: 't1' });
    const unassigned = makeGuest({ id: 'g2' });

    const result = getTableRecommendations([table], [seated, unassigned], [], 0);
    const tableRec = result.find((r) => r.tableId === 't1');
    expect(tableRec?.guests).toHaveLength(0);
  });
});

describe('getGuestRecommendations', () => {
  it('回傳前 N 個結果且按分數排序', () => {
    const tables = [
      makeTable({ id: 't1', name: '第1桌' }),
      makeTable({ id: 't2', name: '第2桌' }),
      makeTable({ id: 't3', name: '第3桌' }),
      makeTable({ id: 't4', name: '第4桌' }),
    ];
    const subcat = { id: 's1', name: '大學同學' };
    // Put subcategory friends in t2 so it scores higher
    const friends = [
      makeGuest({ id: 'f1', assignedTableId: 't2', subcategory: subcat }),
      makeGuest({ id: 'f2', assignedTableId: 't2', subcategory: subcat }),
    ];
    const target = makeGuest({ id: 'g1', subcategory: subcat });
    const allGuests = [target, ...friends];

    const result = getGuestRecommendations(target, tables, allGuests, [], 2);
    expect(result.length).toBeLessThanOrEqual(2);
    // Should be sorted descending
    for (let i = 1; i < result.length; i++) {
      expect(result[i - 1].predictedScore).toBeGreaterThanOrEqual(result[i].predictedScore);
    }
  });

  it('推薦原因包含偏好配對或子分類名稱', () => {
    const table = makeTable({ id: 't1', name: '第1桌' });
    const subcat = { id: 's1', name: '高中同學' };
    const seated = makeGuest({ id: 'g1', assignedTableId: 't1', subcategory: subcat });
    const target = makeGuest({ id: 'g2', subcategory: subcat });

    const result = getGuestRecommendations(target, [table], [seated, target], [], 3);
    expect(result.length).toBeGreaterThanOrEqual(1);
    // Reason should mention subcategory name
    expect(result[0].reason).toContain('高中同學');
  });
});
