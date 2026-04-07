import { describe, it, expect } from 'vitest';
import { matchAllPreferences, summarizeMatches } from '../preference-matcher';
import type { RawGuest } from '../column-detector';

// ─── Helpers ───

function makeRawGuest(overrides: Partial<RawGuest> = {}): RawGuest {
  return {
    name: '測試',
    aliases: [],
    category: '男方',
    rsvpStatus: 'confirmed',
    companionCount: 0,
    dietaryNote: '',
    specialNote: '',
    rawSubcategory: '',
    rawPreferences: [],
    rawAvoids: [],
    ...overrides,
  };
}

// ─── matchAllPreferences ───

describe('matchAllPreferences', () => {
  it('沒有偏好 → 空陣列', () => {
    const guests = [makeRawGuest({ name: '周杰倫' })];
    expect(matchAllPreferences(guests)).toEqual([]);
  });

  it('完全匹配姓名 → exact', () => {
    const guests = [
      makeRawGuest({ name: '周杰倫', rawPreferences: ['蕭敬騰'] }),
      makeRawGuest({ name: '蕭敬騰' }),
    ];
    const result = matchAllPreferences(guests);
    expect(result).toHaveLength(1);
    expect(result[0].status).toBe('exact');
    expect(result[0].selectedIndex).toBe(1);
    expect(result[0].candidates[0].name).toBe('蕭敬騰');
  });

  it('用暱稱配對 → exact', () => {
    const guests = [
      makeRawGuest({ name: '周杰倫', rawPreferences: ['老蕭'] }),
      makeRawGuest({ name: '蕭敬騰', aliases: ['老蕭'] }),
    ];
    const result = matchAllPreferences(guests);
    expect(result).toHaveLength(1);
    expect(result[0].status).toBe('exact');
    expect(result[0].candidates[0].name).toBe('蕭敬騰');
  });

  it('子字串匹配 → fuzzy', () => {
    const guests = [
      makeRawGuest({ name: '周杰倫', rawPreferences: ['敬騰'] }),
      makeRawGuest({ name: '蕭敬騰' }),
    ];
    const result = matchAllPreferences(guests);
    expect(result).toHaveLength(1);
    expect(result[0].status).toBe('fuzzy');
    expect(result[0].selectedIndex).toBeNull();
    expect(result[0].candidates.length).toBeGreaterThan(0);
    expect(result[0].candidates[0].name).toBe('蕭敬騰');
  });

  it('找不到 → unmatched', () => {
    const guests = [
      makeRawGuest({ name: '周杰倫', rawPreferences: ['不存在的人'] }),
      makeRawGuest({ name: '蕭敬騰' }),
    ];
    const result = matchAllPreferences(guests);
    expect(result).toHaveLength(1);
    expect(result[0].status).toBe('unmatched');
    expect(result[0].candidates).toEqual([]);
    expect(result[0].selectedIndex).toBeNull();
  });

  it('不會配對到自己', () => {
    const guests = [
      makeRawGuest({ name: '周杰倫', rawPreferences: ['周杰倫'] }),
    ];
    const result = matchAllPreferences(guests);
    expect(result).toHaveLength(1);
    expect(result[0].status).toBe('unmatched');
  });

  it('多個偏好 → 各自獨立配對', () => {
    const guests = [
      makeRawGuest({ name: '周杰倫', rawPreferences: ['蕭敬騰', '陳信宏', '不存在'] }),
      makeRawGuest({ name: '蕭敬騰' }),
      makeRawGuest({ name: '陳信宏' }),
    ];
    const result = matchAllPreferences(guests);
    expect(result).toHaveLength(3);
    expect(result[0].rank).toBe(1);
    expect(result[0].status).toBe('exact');
    expect(result[1].rank).toBe(2);
    expect(result[1].status).toBe('exact');
    expect(result[2].rank).toBe(3);
    expect(result[2].status).toBe('unmatched');
  });

  it('婉拒的賓客不產生配對', () => {
    const guests = [
      makeRawGuest({ name: '周杰倫', rsvpStatus: 'declined', rawPreferences: ['蕭敬騰'] }),
      makeRawGuest({ name: '蕭敬騰' }),
    ];
    const result = matchAllPreferences(guests);
    expect(result).toHaveLength(0);
  });

  it('婉拒的賓客不出現在候選清單中', () => {
    const guests = [
      makeRawGuest({ name: '周杰倫', rawPreferences: ['蕭敬騰'] }),
      makeRawGuest({ name: '蕭敬騰', rsvpStatus: 'declined' }),
    ];
    const result = matchAllPreferences(guests);
    expect(result).toHaveLength(1);
    expect(result[0].status).toBe('unmatched');
  });

  it('同名多人 → fuzzy（不自動選）', () => {
    const guests = [
      makeRawGuest({ name: '查詢者', rawPreferences: ['小明'] }),
      makeRawGuest({ name: '小明', aliases: [], category: '男方' }),
      makeRawGuest({ name: '小明', aliases: [], category: '女方' }),
    ];
    const result = matchAllPreferences(guests);
    expect(result).toHaveLength(1);
    expect(result[0].status).toBe('fuzzy');
    expect(result[0].selectedIndex).toBeNull();
    expect(result[0].candidates).toHaveLength(2);
  });

  it('使用 searchPool 跨名單配對', () => {
    const newGuests = [
      makeRawGuest({ name: '周杰倫', rawPreferences: ['蕭敬騰'] }),
    ];
    const fullPool = [
      makeRawGuest({ name: '周杰倫' }),
      makeRawGuest({ name: '蕭敬騰' }),
      makeRawGuest({ name: '林俊傑' }),
    ];
    const result = matchAllPreferences(newGuests, fullPool);
    expect(result).toHaveLength(1);
    expect(result[0].status).toBe('exact');
    expect(result[0].candidates[0].name).toBe('蕭敬騰');
  });

  it('fuzzy 候選最多 5 個', () => {
    const guests = [
      makeRawGuest({ name: '查詢者', rawPreferences: ['王'] }),
      ...Array.from({ length: 8 }, (_, i) => makeRawGuest({ name: `王${i}號` })),
    ];
    const result = matchAllPreferences(guests);
    expect(result[0].candidates.length).toBeLessThanOrEqual(5);
  });

  it('fuzzy 候選按分數排序（越接近完全匹配越高）', () => {
    const guests = [
      makeRawGuest({ name: '查詢者', rawPreferences: ['杰倫'] }),
      makeRawGuest({ name: '杰倫' }),         // 完全匹配子字串，score 高
      makeRawGuest({ name: '周杰倫' }),       // 包含但較長，score 稍低
    ];
    const result = matchAllPreferences(guests);
    // '杰倫' 會 exact match，所以只有 '周杰倫' 在 fuzzy
    // 但 '杰倫' 是 exact → 直接被選中
    expect(result[0].status).toBe('exact');
    expect(result[0].candidates[0].name).toBe('杰倫');
  });
});

// ─── summarizeMatches ───

describe('summarizeMatches', () => {
  it('統計各狀態數量', () => {
    const guests = [
      makeRawGuest({ name: 'A', rawPreferences: ['B', 'C', '不存在'] }),
      makeRawGuest({ name: 'B' }),
      makeRawGuest({ name: 'C' }),
    ];
    const matches = matchAllPreferences(guests);
    const summary = summarizeMatches(matches);
    expect(summary.exact).toBe(2);
    expect(summary.unmatched).toBe(1);
    expect(summary.total).toBe(3);
  });

  it('空配對 → 全零', () => {
    const summary = summarizeMatches([]);
    expect(summary).toEqual({ exact: 0, fuzzy: 0, unmatched: 0, total: 0 });
  });
});
