import { describe, it, expect, beforeEach } from 'vitest';
import {
  calculateGroupScore,
  calculatePreferenceScore,
  calculateAvoidPenalty,
  calculateSatisfaction,
  calculateTableAverage,
  recalculateAll,
  isNeighborTable,
  formatScoreDelta,
  getSatisfactionColor,
} from '../satisfaction';
import type { Guest, Table, AvoidPair } from '../types';

// ─── Helpers ───

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

beforeEach(() => { _id = 0; });

// ─── calculateGroupScore ───

describe('calculateGroupScore', () => {
  it('沒有子分類 → 0 分', () => {
    const guest = makeGuest({ subcategory: null, assignedTableId: 't1' });
    const others = [makeGuest({ assignedTableId: 't1' })];
    expect(calculateGroupScore(guest, [guest, ...others])).toBe(0);
  });

  it('同桌全是同群組 (100%) → 20 分', () => {
    const sub = { id: 's1', name: '大學同學' };
    const guest = makeGuest({ id: 'a', subcategory: sub, assignedTableId: 't1' });
    const others = Array.from({ length: 5 }, (_, i) =>
      makeGuest({ id: `o${i}`, subcategory: sub, assignedTableId: 't1' }),
    );
    expect(calculateGroupScore(guest, [guest, ...others])).toBe(20);
  });

  it('同群組佔 50% → 20 分', () => {
    const sub = { id: 's1', name: '大學同學' };
    const guest = makeGuest({ id: 'a', subcategory: sub, assignedTableId: 't1' });
    const same = Array.from({ length: 3 }, (_, i) =>
      makeGuest({ id: `s${i}`, subcategory: sub, assignedTableId: 't1' }),
    );
    const diff = Array.from({ length: 3 }, (_, i) =>
      makeGuest({ id: `d${i}`, subcategory: { id: 's2', name: '公司同事' }, assignedTableId: 't1' }),
    );
    expect(calculateGroupScore(guest, [guest, ...same, ...diff])).toBe(20);
  });

  it('同群組佔 30-50% → 15 分', () => {
    const sub = { id: 's1', name: '大學同學' };
    const guest = makeGuest({ id: 'a', subcategory: sub, assignedTableId: 't1' });
    // 3/9 = 33%
    const same = Array.from({ length: 3 }, (_, i) =>
      makeGuest({ id: `s${i}`, subcategory: sub, assignedTableId: 't1' }),
    );
    const diff = Array.from({ length: 6 }, (_, i) =>
      makeGuest({ id: `d${i}`, subcategory: { id: 's2', name: '公司同事' }, assignedTableId: 't1' }),
    );
    expect(calculateGroupScore(guest, [guest, ...same, ...diff])).toBe(15);
  });

  it('同群組佔 10-30% → 10 分', () => {
    const sub = { id: 's1', name: '大學同學' };
    const guest = makeGuest({ id: 'a', subcategory: sub, assignedTableId: 't1' });
    // 1/8 = 12.5%
    const same = [makeGuest({ id: 's1g', subcategory: sub, assignedTableId: 't1' })];
    const diff = Array.from({ length: 7 }, (_, i) =>
      makeGuest({ id: `d${i}`, subcategory: { id: 's2', name: '公司同事' }, assignedTableId: 't1' }),
    );
    expect(calculateGroupScore(guest, [guest, ...same, ...diff])).toBe(10);
  });

  it('完全沒有同群組 → 0 分', () => {
    const sub = { id: 's1', name: '大學同學' };
    const guest = makeGuest({ id: 'a', subcategory: sub, assignedTableId: 't1' });
    const diff = Array.from({ length: 5 }, (_, i) =>
      makeGuest({ id: `d${i}`, subcategory: { id: 's2', name: '公司同事' }, assignedTableId: 't1' }),
    );
    expect(calculateGroupScore(guest, [guest, ...diff])).toBe(0);
  });

  it('鄰桌有同群組 → 額外 +5', () => {
    const sub = { id: 's1', name: '大學同學' };
    const t1 = makeTable({ id: 't1', positionX: 0, positionY: 0 });
    const t2 = makeTable({ id: 't2', positionX: 300, positionY: 0 }); // 鄰桌（< 450）
    const guest = makeGuest({ id: 'a', subcategory: sub, assignedTableId: 't1' });
    const diff = [makeGuest({ id: 'd1', subcategory: { id: 's2', name: '公司同事' }, assignedTableId: 't1' })];
    const neighbor = makeGuest({ id: 'n1', subcategory: sub, assignedTableId: 't2' });
    // 同桌 0 同群組 → base=0, 鄰桌有 → +5
    expect(calculateGroupScore(guest, [guest, ...diff], [guest, ...diff, neighbor], [t1, t2])).toBe(5);
  });
});

// ─── calculatePreferenceScore ───

describe('calculatePreferenceScore', () => {
  it('沒有偏好 → 0 分', () => {
    const guest = makeGuest({ seatPreferences: [] });
    expect(calculatePreferenceScore(guest, [guest], [], [])).toBe(0);
  });

  it('3/3 想同桌的人都在同桌 → 25 分', () => {
    const guest = makeGuest({
      id: 'a',
      assignedTableId: 't1',
      seatPreferences: [
        { preferredGuestId: 'b', rank: 1 },
        { preferredGuestId: 'c', rank: 2 },
        { preferredGuestId: 'd', rank: 3 },
      ],
    });
    const b = makeGuest({ id: 'b', assignedTableId: 't1' });
    const c = makeGuest({ id: 'c', assignedTableId: 't1' });
    const d = makeGuest({ id: 'd', assignedTableId: 't1' });
    expect(calculatePreferenceScore(guest, [guest, b, c, d], [guest, b, c, d], [])).toBe(25);
  });

  it('2/3 在同桌 → 18 分', () => {
    const guest = makeGuest({
      id: 'a',
      assignedTableId: 't1',
      seatPreferences: [
        { preferredGuestId: 'b', rank: 1 },
        { preferredGuestId: 'c', rank: 2 },
        { preferredGuestId: 'd', rank: 3 },
      ],
    });
    const b = makeGuest({ id: 'b', assignedTableId: 't1' });
    const c = makeGuest({ id: 'c', assignedTableId: 't1' });
    const d = makeGuest({ id: 'd', assignedTableId: 't2' });
    expect(calculatePreferenceScore(guest, [guest, b, c], [guest, b, c, d], [])).toBe(18);
  });

  it('1/3 在同桌 → 10 分', () => {
    const guest = makeGuest({
      id: 'a',
      assignedTableId: 't1',
      seatPreferences: [
        { preferredGuestId: 'b', rank: 1 },
        { preferredGuestId: 'c', rank: 2 },
        { preferredGuestId: 'd', rank: 3 },
      ],
    });
    const b = makeGuest({ id: 'b', assignedTableId: 't1' });
    expect(calculatePreferenceScore(guest, [guest, b], [guest, b], [])).toBe(10);
  });

  it('0/3 在同桌但 1 人在鄰桌 → 3 分', () => {
    const t1 = makeTable({ id: 't1', positionX: 0, positionY: 0 });
    const t2 = makeTable({ id: 't2', positionX: 300, positionY: 0 });
    const guest = makeGuest({
      id: 'a',
      assignedTableId: 't1',
      seatPreferences: [{ preferredGuestId: 'b', rank: 1 }],
    });
    const b = makeGuest({ id: 'b', assignedTableId: 't2' });
    expect(calculatePreferenceScore(guest, [guest], [guest, b], [t1, t2])).toBe(3);
  });

  it('鄰桌 bonus 上限 25', () => {
    const t1 = makeTable({ id: 't1', positionX: 0, positionY: 0 });
    const t2 = makeTable({ id: 't2', positionX: 300, positionY: 0 });
    const guest = makeGuest({
      id: 'a',
      assignedTableId: 't1',
      seatPreferences: [
        { preferredGuestId: 'b', rank: 1 },
        { preferredGuestId: 'c', rank: 2 },
        { preferredGuestId: 'd', rank: 3 },
      ],
    });
    // 2 在同桌 (18) + 1 在鄰桌 (+3) = 21, 不超過 25
    const b = makeGuest({ id: 'b', assignedTableId: 't1' });
    const c = makeGuest({ id: 'c', assignedTableId: 't1' });
    const d = makeGuest({ id: 'd', assignedTableId: 't2' });
    expect(calculatePreferenceScore(guest, [guest, b, c], [guest, b, c, d], [t1, t2])).toBe(21);
  });
});

// ─── calculateAvoidPenalty ───

describe('calculateAvoidPenalty', () => {
  it('沒有避免同桌 → 0', () => {
    const guest = makeGuest({ id: 'a', assignedTableId: 't1' });
    expect(calculateAvoidPenalty(guest, [guest], [])).toBe(0);
  });

  it('有 1 組避免同桌 → 60', () => {
    const guest = makeGuest({ id: 'a', assignedTableId: 't1' });
    const enemy = makeGuest({ id: 'b', assignedTableId: 't1' });
    const pairs: AvoidPair[] = [{ id: 'ap1', guestAId: 'a', guestBId: 'b', reason: null }];
    expect(calculateAvoidPenalty(guest, [guest, enemy], pairs)).toBe(60);
  });

  it('有 2 組避免同桌 → 120', () => {
    const guest = makeGuest({ id: 'a', assignedTableId: 't1' });
    const enemy1 = makeGuest({ id: 'b', assignedTableId: 't1' });
    const enemy2 = makeGuest({ id: 'c', assignedTableId: 't1' });
    const pairs: AvoidPair[] = [
      { id: 'ap1', guestAId: 'a', guestBId: 'b', reason: null },
      { id: 'ap2', guestAId: 'c', guestBId: 'a', reason: null }, // 反向也要算
    ];
    expect(calculateAvoidPenalty(guest, [guest, enemy1, enemy2], pairs)).toBe(120);
  });

  it('避免對象不在同桌 → 0', () => {
    const guest = makeGuest({ id: 'a', assignedTableId: 't1' });
    const other = makeGuest({ id: 'x', assignedTableId: 't1' });
    const pairs: AvoidPair[] = [{ id: 'ap1', guestAId: 'a', guestBId: 'b', reason: null }];
    expect(calculateAvoidPenalty(guest, [guest, other], pairs)).toBe(0);
  });
});

// ─── isNeighborTable ───

describe('isNeighborTable', () => {
  it('距離 300 → 鄰桌', () => {
    const a = makeTable({ positionX: 0, positionY: 0 });
    const b = makeTable({ positionX: 300, positionY: 0 });
    expect(isNeighborTable(a, b)).toBe(true);
  });

  it('距離 450 → 鄰桌（邊界）', () => {
    const a = makeTable({ positionX: 0, positionY: 0 });
    const b = makeTable({ positionX: 450, positionY: 0 });
    expect(isNeighborTable(a, b)).toBe(true);
  });

  it('距離 451 → 非鄰桌', () => {
    const a = makeTable({ positionX: 0, positionY: 0 });
    const b = makeTable({ positionX: 451, positionY: 0 });
    expect(isNeighborTable(a, b)).toBe(false);
  });

  it('同位置 → 鄰桌', () => {
    const a = makeTable({ positionX: 100, positionY: 100 });
    const b = makeTable({ positionX: 100, positionY: 100 });
    expect(isNeighborTable(a, b)).toBe(true);
  });
});

// ─── calculateSatisfaction 整合 ───

describe('calculateSatisfaction', () => {
  it('婉拒的賓客 → 0 分', () => {
    const guest = makeGuest({ rsvpStatus: 'declined' });
    expect(calculateSatisfaction(guest, [], [])).toBe(0);
  });

  it('未分配座位 → 55 分 (基礎 50 + 需求 5)', () => {
    const guest = makeGuest({ assignedTableId: null });
    expect(calculateSatisfaction(guest, [guest], [])).toBe(55);
  });

  it('已分配、無群組、無偏好 → 55 分 (基礎 50 + 需求 5)', () => {
    const guest = makeGuest({ id: 'a', assignedTableId: 't1' });
    const t = makeTable({ id: 't1' });
    expect(calculateSatisfaction(guest, [guest], [t])).toBe(55);
  });

  it('滿分場景：100% 同群組 + 3/3 偏好 → 100 分', () => {
    const sub = { id: 's1', name: '大學同學' };
    const guest = makeGuest({
      id: 'a', assignedTableId: 't1', subcategory: sub,
      seatPreferences: [
        { preferredGuestId: 'b', rank: 1 },
        { preferredGuestId: 'c', rank: 2 },
        { preferredGuestId: 'd', rank: 3 },
      ],
    });
    const b = makeGuest({ id: 'b', assignedTableId: 't1', subcategory: sub });
    const c = makeGuest({ id: 'c', assignedTableId: 't1', subcategory: sub });
    const d = makeGuest({ id: 'd', assignedTableId: 't1', subcategory: sub });
    const t = makeTable({ id: 't1' });
    // 50 + 20 + 25 + 5 = 100
    expect(calculateSatisfaction(guest, [guest, b, c, d], [t])).toBe(100);
  });

  it('避免同桌懲罰不會讓分數低於 0', () => {
    const guest = makeGuest({ id: 'a', assignedTableId: 't1' });
    const enemy = makeGuest({ id: 'b', assignedTableId: 't1' });
    const t = makeTable({ id: 't1' });
    const pairs: AvoidPair[] = [
      { id: 'ap1', guestAId: 'a', guestBId: 'b', reason: null },
    ];
    // 50 + 0 + 0 + 5 - 60 = -5 → clamp to 0
    expect(calculateSatisfaction(guest, [guest, enemy], [t], pairs)).toBe(0);
  });
});

// ─── calculateTableAverage ───

describe('calculateTableAverage', () => {
  it('空桌 → 0', () => {
    expect(calculateTableAverage('t1', [], [])).toBe(0);
  });

  it('計算桌上所有賓客的平均滿意度', () => {
    const t = makeTable({ id: 't1' });
    const g1 = makeGuest({ id: 'a', assignedTableId: 't1' });
    const g2 = makeGuest({ id: 'b', assignedTableId: 't1' });
    // 兩人都是 55 分 (base 50 + needs 5)
    const avg = calculateTableAverage('t1', [g1, g2], [t]);
    expect(avg).toBe(55);
  });

  it('不計算婉拒的賓客', () => {
    const t = makeTable({ id: 't1' });
    const g1 = makeGuest({ id: 'a', assignedTableId: 't1' });
    const declined = makeGuest({ id: 'b', assignedTableId: 't1', rsvpStatus: 'declined' });
    const avg = calculateTableAverage('t1', [g1, declined], [t]);
    expect(avg).toBe(55); // 只算 g1
  });
});

// ─── recalculateAll ───

describe('recalculateAll', () => {
  it('回傳所有確認賓客的分數和桌次平均', () => {
    const t = makeTable({ id: 't1' });
    const g1 = makeGuest({ id: 'a', assignedTableId: 't1' });
    const g2 = makeGuest({ id: 'b', assignedTableId: 't1' });
    const result = recalculateAll([g1, g2], [t]);
    expect(result.guests).toHaveLength(2);
    expect(result.tables).toHaveLength(1);
    expect(result.overallAverage).toBe(55);
  });

  it('無已分配賓客 → overallAverage = 0', () => {
    const t = makeTable({ id: 't1' });
    const g1 = makeGuest({ id: 'a', assignedTableId: null });
    const result = recalculateAll([g1], [t]);
    expect(result.overallAverage).toBe(0);
  });

  it('婉拒的賓客不納入計算', () => {
    const t = makeTable({ id: 't1' });
    const g1 = makeGuest({ id: 'a', assignedTableId: 't1' });
    const declined = makeGuest({ id: 'b', rsvpStatus: 'declined' });
    const result = recalculateAll([g1, declined], [t]);
    expect(result.guests).toHaveLength(1); // 只有 confirmed
  });
});

// ─── formatScoreDelta ───

describe('formatScoreDelta', () => {
  it('+0.5 → +1（至少 ±1）', () => expect(formatScoreDelta(0.5)).toBe(1));
  it('+5.3 → +5', () => expect(formatScoreDelta(5.3)).toBe(5));
  it('-0.5 → -1（至少 ±1）', () => expect(formatScoreDelta(-0.5)).toBe(-1));
  it('-3.7 → -4', () => expect(formatScoreDelta(-3.7)).toBe(-4));
  it('0.05 → 0（在 ±0.1 之內）', () => expect(formatScoreDelta(0.05)).toBe(0));
  it('-0.05 → 0', () => expect(formatScoreDelta(-0.05)).toBe(0));
  it('0 → 0', () => expect(formatScoreDelta(0)).toBe(0));
});

// ─── getSatisfactionColor ───

describe('getSatisfactionColor', () => {
  it('>=75 → 綠', () => expect(getSatisfactionColor(75)).toBe('#16A34A'));
  it('>=50 → 黃', () => expect(getSatisfactionColor(50)).toBe('#CA8A04'));
  it('>=25 → 橘', () => expect(getSatisfactionColor(25)).toBe('#EA580C'));
  it('<25 → 紅', () => expect(getSatisfactionColor(24)).toBe('#DC2626'));
  it('100 → 綠', () => expect(getSatisfactionColor(100)).toBe('#16A34A'));
  it('0 → 紅', () => expect(getSatisfactionColor(0)).toBe('#DC2626'));
});
