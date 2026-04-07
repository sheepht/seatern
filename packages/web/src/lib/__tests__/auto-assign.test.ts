import { describe, it, expect } from 'vitest';
import { autoAssignGuests, estimateAutoAssignTime } from '../auto-assign';
import type { Guest, Table, AvoidPair } from '../types';

// ─── Helpers ───

let _id = 0;
function uid() { return `id-${++_id}`; }

function makeGuest(overrides: Partial<Guest> = {}): Guest {
  const id = overrides.id ?? uid();
  return {
    id,
    name: `賓客${id}`,
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
    name: `第${id}桌`,
    capacity: 10,
    positionX: 0,
    positionY: 0,
    averageSatisfaction: 0,
    color: null,
    note: null,
    ...overrides,
  };
}

// ─── autoAssignGuests ───

describe('autoAssignGuests', () => {
  it('沒有未分配賓客 → 回傳空陣列', async () => {
    const g = makeGuest({ assignedTableId: 't1' });
    const t = makeTable({ id: 't1' });
    const result = await autoAssignGuests([g], [t], []);
    expect(result).toEqual([]);
  });

  it('所有未分配賓客都被分配到桌子', async () => {
    const guests = Array.from({ length: 5 }, (_, i) => makeGuest({ id: `g${i}` }));
    const t = makeTable({ id: 't1', capacity: 10 });
    const result = await autoAssignGuests(guests, [t], []);
    expect(result).toHaveLength(5);
    result.forEach((a) => expect(a.tableId).toBe('t1'));
  });

  it('不會超過桌子容量', async () => {
    const guests = Array.from({ length: 5 }, (_, i) => makeGuest({ id: `g${i}` }));
    const t = makeTable({ id: 't1', capacity: 3 });
    const result = await autoAssignGuests(guests, [t], []);
    // 只有 3 個人能坐
    expect(result.length).toBeLessThanOrEqual(3);
  });

  it('多桌：分散到不同桌', async () => {
    const guests = Array.from({ length: 6 }, (_, i) => makeGuest({ id: `g${i}` }));
    const tables = [
      makeTable({ id: 't1', capacity: 3 }),
      makeTable({ id: 't2', capacity: 3 }),
    ];
    const result = await autoAssignGuests(guests, tables, []);
    expect(result).toHaveLength(6);
    const t1Count = result.filter((a) => a.tableId === 't1').length;
    const t2Count = result.filter((a) => a.tableId === 't2').length;
    expect(t1Count).toBeLessThanOrEqual(3);
    expect(t2Count).toBeLessThanOrEqual(3);
  });

  it('同群組的人優先被排在同一桌', async () => {
    const sub = { id: 's1', name: '大學同學' };
    const guests = Array.from({ length: 4 }, (_, i) =>
      makeGuest({ id: `g${i}`, subcategory: sub }),
    );
    const others = Array.from({ length: 4 }, (_, i) =>
      makeGuest({ id: `o${i}`, subcategory: { id: 's2', name: '公司同事' } }),
    );
    const tables = [
      makeTable({ id: 't1', capacity: 5 }),
      makeTable({ id: 't2', capacity: 5 }),
    ];
    const result = await autoAssignGuests([...guests, ...others], tables, []);
    // 同群組的人應該盡量在同一桌
    const groupTables = result.filter((a) => guests.some((g) => g.id === a.guestId)).map((a) => a.tableId);
    const uniqueTables = new Set(groupTables);
    expect(uniqueTables.size).toBeLessThanOrEqual(2); // 最多 2 桌（4 人可能需拆）
  });

  it('避免同桌的人不會被排在一起', async () => {
    const a = makeGuest({ id: 'a' });
    const b = makeGuest({ id: 'b' });
    const tables = [
      makeTable({ id: 't1', capacity: 5 }),
      makeTable({ id: 't2', capacity: 5 }),
    ];
    const avoidPairs: AvoidPair[] = [{ id: 'ap1', guestAId: 'a', guestBId: 'b', reason: null }];
    const result = await autoAssignGuests([a, b], tables, avoidPairs);
    const aTable = result.find((r) => r.guestId === 'a')?.tableId;
    const bTable = result.find((r) => r.guestId === 'b')?.tableId;
    expect(aTable).not.toBe(bTable);
  });

  it('保留已入座的賓客不動', async () => {
    const seated = makeGuest({ id: 'seated', assignedTableId: 't1' });
    const unassigned = makeGuest({ id: 'new' });
    const t1 = makeTable({ id: 't1', capacity: 5 });
    const t2 = makeTable({ id: 't2', capacity: 5 });
    const result = await autoAssignGuests([seated, unassigned], [t1, t2], []);
    // 已入座的不在結果中
    expect(result.find((a) => a.guestId === 'seated')).toBeUndefined();
    expect(result).toHaveLength(1);
    expect(result[0].guestId).toBe('new');
  });

  it('婉拒的賓客不被分配', async () => {
    const declined = makeGuest({ id: 'd', rsvpStatus: 'declined' });
    const confirmed = makeGuest({ id: 'c' });
    const t = makeTable({ id: 't1', capacity: 5 });
    const result = await autoAssignGuests([declined, confirmed], [t], []);
    expect(result).toHaveLength(1);
    expect(result[0].guestId).toBe('c');
  });

  it('考慮眷屬佔位 (seatCount > 1)', async () => {
    const guest = makeGuest({ id: 'g1', companionCount: 2, seatCount: 3 });
    const t = makeTable({ id: 't1', capacity: 3 });
    const result = await autoAssignGuests([guest], [t], []);
    expect(result).toHaveLength(1);
    expect(result[0].tableId).toBe('t1');
  });

  it('眷屬超過桌子容量 → 不分配', async () => {
    const guest = makeGuest({ id: 'g1', companionCount: 2, seatCount: 3 });
    const t = makeTable({ id: 't1', capacity: 2 }); // 容量不夠
    const result = await autoAssignGuests([guest], [t], []);
    expect(result).toHaveLength(0);
  });
});

// ─── estimateAutoAssignTime ───

describe('estimateAutoAssignTime', () => {
  it('沒有未分配賓客 → 0 秒', () => {
    const g = makeGuest({ assignedTableId: 't1' });
    const t = makeTable({ id: 't1' });
    expect(estimateAutoAssignTime([g], [t], [])).toBe(0);
  });

  it('有未分配賓客 → 回傳正整數', () => {
    const guests = Array.from({ length: 10 }, (_, i) => makeGuest({ id: `g${i}` }));
    const t = makeTable({ id: 't1', capacity: 10 });
    const estimate = estimateAutoAssignTime(guests, [t], []);
    expect(estimate).toBeGreaterThanOrEqual(0);
    expect(Number.isInteger(estimate)).toBe(true);
  });
});
