import { describe, it, expect } from 'vitest';
import { demoScorer, moveGuest, type DemoState } from '../landing/demoScorer';
import { demoFixtures } from '../landing/demoFixtures';

function makeState(overrides: Partial<DemoState> = {}): DemoState {
  return {
    guests: { ...demoFixtures.guests },
    tables: JSON.parse(JSON.stringify(demoFixtures.tables)),
    ...overrides,
  };
}

describe('demoScorer — fixtures 劇本', () => {
  it('初始狀態：t1 ≈ 75、t2 ≈ 91（志明 g3 放錯桌）', () => {
    const { tableAvg } = demoScorer(demoFixtures);
    expect(tableAvg.t1).toBe(75);
    expect(tableAvg.t2).toBe(91);
  });

  it('志明獨自在錯邊：perGuest g3 = 50（無同群組、無 prefs 在同桌）', () => {
    const { perGuest } = demoScorer(demoFixtures);
    expect(perGuest.g3).toBe(50);
  });

  it('移動志明 g3 到 t2 後：兩桌分數都上升', () => {
    const before = demoScorer(demoFixtures);
    const after = demoScorer(moveGuest(demoFixtures, 'g3', 't2'));

    expect(after.tableAvg.t1).toBeGreaterThan(before.tableAvg.t1);
    expect(after.tableAvg.t2).toBeGreaterThan(before.tableAvg.t2);
    expect(after.tableAvg.t1).toBe(87);
    expect(after.tableAvg.t2).toBe(99);
  });

  it('移動後志明 g3 個人分數達 100（滿群組 + 滿偏好）', () => {
    const { perGuest } = demoScorer(moveGuest(demoFixtures, 'g3', 't2'));
    expect(perGuest.g3).toBe(100);
  });
});

describe('demoScorer — 群組分門檻', () => {
  it('同桌 50%+ 同 group → +25', () => {
    const state: DemoState = {
      guests: {
        a: { id: 'a', name: 'A', group: 'bride', mutualPrefs: [] },
        b: { id: 'b', name: 'B', group: 'bride', mutualPrefs: [] },
        c: { id: 'c', name: 'C', group: 'groom', mutualPrefs: [] },
      },
      tables: {
        t: { id: 't', name: 't', capacity: 4, guestIds: ['a', 'b', 'c'] },
      },
    };
    // a 的其他人 (b, c) 中 b 是 bride = 50% → +25
    const { perGuest } = demoScorer(state);
    expect(perGuest.a).toBe(50 + 25);
  });

  it('同桌 25-49% 同 group → +12', () => {
    const state: DemoState = {
      guests: {
        a: { id: 'a', name: 'A', group: 'bride', mutualPrefs: [] },
        b: { id: 'b', name: 'B', group: 'bride', mutualPrefs: [] },
        c: { id: 'c', name: 'C', group: 'groom', mutualPrefs: [] },
        d: { id: 'd', name: 'D', group: 'groom', mutualPrefs: [] },
        e: { id: 'e', name: 'E', group: 'groom', mutualPrefs: [] },
      },
      tables: {
        t: { id: 't', name: 't', capacity: 5, guestIds: ['a', 'b', 'c', 'd', 'e'] },
      },
    };
    // a 的其他人 (b,c,d,e) 中 b 是 bride = 1/4 = 25% → +12
    const { perGuest } = demoScorer(state);
    expect(perGuest.a).toBe(50 + 12);
  });

  it('同桌 0 同 group → +0', () => {
    const state: DemoState = {
      guests: {
        a: { id: 'a', name: 'A', group: 'bride', mutualPrefs: [] },
        b: { id: 'b', name: 'B', group: 'groom', mutualPrefs: [] },
      },
      tables: {
        t: { id: 't', name: 't', capacity: 4, guestIds: ['a', 'b'] },
      },
    };
    const { perGuest } = demoScorer(state);
    expect(perGuest.a).toBe(50);
  });
});

describe('demoScorer — 偏好分上限', () => {
  it('1 位 pref 在同桌 → +12', () => {
    const state: DemoState = {
      guests: {
        a: { id: 'a', name: 'A', group: 'bride', mutualPrefs: ['b'] },
        b: { id: 'b', name: 'B', group: 'groom', mutualPrefs: [] },
      },
      tables: { t: { id: 't', name: 't', capacity: 4, guestIds: ['a', 'b'] } },
    };
    // group: a 唯一 bride vs b groom → 0%, +0
    // prefs: b 在同桌 → +12
    const { perGuest } = demoScorer(state);
    expect(perGuest.a).toBe(50 + 0 + 12);
  });

  it('3 位 prefs 全在同桌 → 封頂 +25（不是 +36）', () => {
    const state: DemoState = {
      guests: {
        a: { id: 'a', name: 'A', group: 'bride', mutualPrefs: ['b', 'c', 'd'] },
        b: { id: 'b', name: 'B', group: 'bride', mutualPrefs: [] },
        c: { id: 'c', name: 'C', group: 'bride', mutualPrefs: [] },
        d: { id: 'd', name: 'D', group: 'bride', mutualPrefs: [] },
      },
      tables: { t: { id: 't', name: 't', capacity: 4, guestIds: ['a', 'b', 'c', 'd'] } },
    };
    // group: 100% bride → +25
    // prefs: 3 全在 → min(36, 25) = +25
    const { perGuest } = demoScorer(state);
    expect(perGuest.a).toBe(50 + 25 + 25);
  });

  it('pref 不存在於任何桌 → +0', () => {
    const state: DemoState = {
      guests: {
        a: { id: 'a', name: 'A', group: 'bride', mutualPrefs: ['ghost'] },
      },
      tables: { t: { id: 't', name: 't', capacity: 4, guestIds: ['a'] } },
    };
    const { perGuest } = demoScorer(state);
    expect(perGuest.a).toBe(50);
  });
});

describe('demoScorer — 邊界狀態', () => {
  it('空桌 → tableAvg 50', () => {
    const state: DemoState = {
      guests: {},
      tables: { t: { id: 't', name: 't', capacity: 4, guestIds: [] } },
    };
    const { tableAvg, perGuest } = demoScorer(state);
    expect(tableAvg.t).toBe(50);
    expect(Object.keys(perGuest)).toHaveLength(0);
  });

  it('單人桌 → 50（無同群組對象，無 prefs 在同桌）', () => {
    const state: DemoState = {
      guests: {
        a: { id: 'a', name: 'A', group: 'bride', mutualPrefs: [] },
      },
      tables: { t: { id: 't', name: 't', capacity: 4, guestIds: ['a'] } },
    };
    const { perGuest, tableAvg } = demoScorer(state);
    expect(perGuest.a).toBe(50);
    expect(tableAvg.t).toBe(50);
  });

  it('桌子的 guestIds 指向不存在的 guest → 忽略，不崩潰', () => {
    const state: DemoState = {
      guests: {
        a: { id: 'a', name: 'A', group: 'bride', mutualPrefs: [] },
      },
      tables: { t: { id: 't', name: 't', capacity: 4, guestIds: ['a', 'ghost'] } },
    };
    const { perGuest, tableAvg } = demoScorer(state);
    expect(perGuest.a).toBe(50);
    expect(tableAvg.t).toBe(50);
    expect(perGuest.ghost).toBeUndefined();
  });

  it('所有 guestIds 都是孤兒 → tableAvg 50（fallback）', () => {
    const state: DemoState = {
      guests: {},
      tables: {
        t: { id: 't', name: 't', capacity: 4, guestIds: ['ghost1', 'ghost2'] },
      },
    };
    const { tableAvg } = demoScorer(state);
    expect(tableAvg.t).toBe(50);
  });
});

describe('moveGuest', () => {
  it('拖到另一桌 → state 更新（原桌移除 + 新桌加入）', () => {
    const next = moveGuest(demoFixtures, 'g3', 't2');
    expect(next.tables.t1.guestIds).not.toContain('g3');
    expect(next.tables.t2.guestIds).toContain('g3');
  });

  it('拖回自己原桌 → no-op，回傳原 state（referential）', () => {
    const next = moveGuest(demoFixtures, 'g1', 't1');
    expect(next).toBe(demoFixtures);
  });

  it('拖到已滿的桌 → no-op', () => {
    const packed: DemoState = makeState();
    packed.tables.t2.guestIds = ['g4', 'g5', 'g6', 'g1-extra', 'g2-extra'];
    packed.tables.t2.capacity = 4;
    const next = moveGuest(packed, 'g1', 't2');
    expect(next).toBe(packed);
  });

  it('guestId 不存在 → no-op', () => {
    const next = moveGuest(demoFixtures, 'ghost', 't2');
    expect(next).toBe(demoFixtures);
  });

  it('toTableId 不存在 → no-op', () => {
    const next = moveGuest(demoFixtures, 'g1', 'ghost-table');
    expect(next).toBe(demoFixtures);
  });

  it('guest 不在任何桌上 → no-op', () => {
    const orphan: DemoState = {
      guests: { lost: { id: 'lost', name: 'Lost', group: 'bride', mutualPrefs: [] } },
      tables: { t: { id: 't', name: 't', capacity: 4, guestIds: [] } },
    };
    const next = moveGuest(orphan, 'lost', 't');
    expect(next).toBe(orphan);
  });

  it('不可變：原 state 不被突變', () => {
    const snapshot = JSON.parse(JSON.stringify(demoFixtures));
    moveGuest(demoFixtures, 'g3', 't2');
    expect(demoFixtures).toEqual(snapshot);
  });
});
