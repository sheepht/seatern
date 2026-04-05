import { describe, it, expect } from 'vitest';
import { computeSnapshotStats, computeCurrentStats } from '../snapshot-stats';
import type { Guest, Table } from '@/stores/seating';

// ─── Helpers ───

function makeGuest(overrides: Partial<Guest> = {}): Guest {
  return {
    id: 'g1',
    name: '王小明',
    aliases: [],
    category: '男方',
    rsvpStatus: 'confirmed',
    companionCount: 0,
    seatCount: 1,
    dietaryNote: '',
    specialNote: '',
    satisfactionScore: 80,
    assignedTableId: 't1',
    seatIndex: 0,
    isOverflow: false,
    isIsolated: false,
    seatPreferences: [],
    subcategory: null,
    ...overrides,
  };
}

function makeTable(overrides: Partial<Table> = {}): Table {
  return {
    id: 't1',
    name: '第1桌',
    capacity: 10,
    positionX: 0,
    positionY: 0,
    averageSatisfaction: 80,
    color: null,
    note: null,
    ...overrides,
  };
}

// ─── computeSnapshotStats ───

describe('computeSnapshotStats', () => {
  it('正常快照：計算已安排/未安排、分佈、桌數、溢出', () => {
    const data = {
      guests: [
        { guestId: 'g1', tableId: 't1', satisfactionScore: 80, isOverflow: false },
        { guestId: 'g2', tableId: 't1', satisfactionScore: 60, isOverflow: true },
        { guestId: 'g3', tableId: null, satisfactionScore: 50 },
      ],
      tables: [
        { tableId: 't1', name: '第1桌', positionX: 0, positionY: 0 },
      ],
    };
    const stats = computeSnapshotStats(data, 70);
    expect(stats.total).toBe(3);
    expect(stats.assigned).toBe(2);
    expect(stats.tableCount).toBe(1);
    expect(stats.average).toBe(70); // uses provided averageSatisfaction
    expect(stats.green).toBe(1);   // 80 >= 75
    expect(stats.yellow).toBe(1);  // 60 >= 50
    expect(stats.orange).toBe(0);
    expect(stats.red).toBe(0);
    expect(stats.overflowCount).toBe(1); // g2 is overflow
  });

  it('data 為 null → 回傳全零', () => {
    const stats = computeSnapshotStats(null);
    expect(stats.total).toBe(0);
    expect(stats.assigned).toBe(0);
    expect(stats.tableCount).toBe(0);
    expect(stats.average).toBe(0);
    expect(stats.overflowCount).toBe(0);
  });

  it('data 為 undefined → 回傳全零', () => {
    const stats = computeSnapshotStats(undefined);
    expect(stats.total).toBe(0);
  });

  it('data.guests 為空陣列 → 回傳全零', () => {
    const stats = computeSnapshotStats({ guests: [], tables: [] });
    expect(stats.total).toBe(0);
    expect(stats.assigned).toBe(0);
    expect(stats.average).toBe(0);
  });

  it('guests 缺少 satisfactionScore → 不計入分佈，自算平均', () => {
    const data = {
      guests: [
        { guestId: 'g1', tableId: 't1' }, // 無 satisfactionScore
        { guestId: 'g2', tableId: 't1', satisfactionScore: 90 },
      ],
      tables: [{ tableId: 't1', positionX: 0, positionY: 0 }],
    };
    const stats = computeSnapshotStats(data, 0); // averageSatisfaction = 0, fallback 自算
    expect(stats.assigned).toBe(2);
    expect(stats.green).toBe(1);   // 只有 g2 (90) 進入分佈
    expect(stats.average).toBe(90); // 只算有分數的
  });

  it('data.tables 為 undefined → tableCount = 0', () => {
    const data = { guests: [{ guestId: 'g1', tableId: 't1', satisfactionScore: 50 }] };
    const stats = computeSnapshotStats(data);
    expect(stats.tableCount).toBe(0);
    expect(stats.assigned).toBe(1);
  });

  it('無 averageSatisfaction 時自動計算平均', () => {
    const data = {
      guests: [
        { guestId: 'g1', tableId: 't1', satisfactionScore: 80 },
        { guestId: 'g2', tableId: 't1', satisfactionScore: 60 },
      ],
      tables: [],
    };
    const stats = computeSnapshotStats(data); // 不傳 averageSatisfaction
    expect(stats.average).toBe(70); // (80 + 60) / 2
  });
});

// ─── computeCurrentStats ───

describe('computeCurrentStats', () => {
  it('正常狀態：計算 confirmed 的統計', () => {
    const guests = [
      makeGuest({ id: 'g1', satisfactionScore: 80, assignedTableId: 't1' }),
      makeGuest({ id: 'g2', satisfactionScore: 40, assignedTableId: 't1', isOverflow: true }),
      makeGuest({ id: 'g3', satisfactionScore: 50, assignedTableId: null }),
      makeGuest({ id: 'g4', rsvpStatus: 'declined' }), // 不計入
    ];
    const tables = [makeTable()];
    const stats = computeCurrentStats(guests, tables);
    expect(stats.total).toBe(3);    // 3 confirmed
    expect(stats.assigned).toBe(2); // 2 有桌
    expect(stats.tableCount).toBe(1);
    expect(stats.green).toBe(1);    // 80 >= 75
    expect(stats.yellow).toBe(0);
    expect(stats.orange).toBe(1);   // 40 >= 25
    expect(stats.red).toBe(0);
    expect(stats.average).toBe(60); // (80 + 40) / 2
    expect(stats.overflowCount).toBe(1); // g2 is overflow
  });

  it('零 confirmed 賓客 → 全零', () => {
    const guests = [makeGuest({ rsvpStatus: 'declined' })];
    const stats = computeCurrentStats(guests, []);
    expect(stats.total).toBe(0);
    expect(stats.assigned).toBe(0);
    expect(stats.average).toBe(0);
  });

  it('全部未安排 → assigned=0, average=0', () => {
    const guests = [
      makeGuest({ id: 'g1', assignedTableId: null }),
      makeGuest({ id: 'g2', assignedTableId: null }),
    ];
    const stats = computeCurrentStats(guests, [makeTable()]);
    expect(stats.total).toBe(2);
    expect(stats.assigned).toBe(0);
    expect(stats.average).toBe(0);
    expect(stats.tableCount).toBe(1);
  });
});
