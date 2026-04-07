import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  hslToHex,
  makeColor,
  getCategoryColor,
  loadCategoryColors,
  FALLBACK_COLOR,
  DEFAULT_CATEGORY_COLORS,
} from '../category-colors';

describe('hslToHex', () => {
  it('紅色 (0, 100, 50) → 接近 #ff0000', () => {
    const hex = hslToHex(0, 100, 50);
    expect(hex).toBe('#ff0000');
  });

  it('黑色 (0, 0, 0) → #000000', () => {
    const hex = hslToHex(0, 0, 0);
    expect(hex).toBe('#000000');
  });

  it('白色 (0, 0, 100) → #ffffff', () => {
    const hex = hslToHex(0, 0, 100);
    expect(hex).toBe('#ffffff');
  });
});

describe('makeColor', () => {
  it('回傳含 background/border/color 的物件', () => {
    const result = makeColor(220, 90);
    expect(result).toHaveProperty('background');
    expect(result).toHaveProperty('border');
    expect(result).toHaveProperty('color');
    expect(result.background).toMatch(/^#[0-9a-f]{6}$/);
    expect(result.border).toMatch(/^#[0-9a-f]{6}$/);
    expect(result.color).toMatch(/^#[0-9a-f]{6}$/);
  });
});

describe('getCategoryColor', () => {
  const colors = { ...DEFAULT_CATEGORY_COLORS };

  it('已知分類 → 回傳對應顏色', () => {
    const result = getCategoryColor('男方', colors);
    expect(result).toEqual(DEFAULT_CATEGORY_COLORS['男方']);
  });

  it('未知分類 → 回傳 FALLBACK_COLOR', () => {
    const result = getCategoryColor('不存在的分類', colors);
    expect(result).toEqual(FALLBACK_COLOR);
  });

  it('undefined → 回傳 FALLBACK_COLOR', () => {
    const result = getCategoryColor(undefined, colors);
    expect(result).toEqual(FALLBACK_COLOR);
  });
});

describe('loadCategoryColors', () => {
  beforeEach(() => {
    // Ensure localStorage is available (jsdom or stub)
    if (typeof localStorage === 'undefined') {
      const store: Record<string, string> = {};
      vi.stubGlobal('localStorage', {
        getItem: vi.fn((key: string) => store[key] ?? null),
        setItem: vi.fn((key: string, val: string) => { store[key] = val; }),
        removeItem: vi.fn((key: string) => { delete store[key]; }),
        clear: vi.fn(() => { Object.keys(store).forEach((k) => delete store[k]); }),
      });
    } else {
      localStorage.clear();
    }
  });

  it('localStorage 無資料 → 回傳預設值', () => {
    const result = loadCategoryColors('event-1');
    expect(result['男方']).toEqual(DEFAULT_CATEGORY_COLORS['男方']);
    expect(result['女方']).toEqual(DEFAULT_CATEGORY_COLORS['女方']);
    expect(result['共同']).toEqual(DEFAULT_CATEGORY_COLORS['共同']);
  });

  it('localStorage 有儲存資料 → 合併預設值', () => {
    const custom = { '公司': { background: '#eee', border: '#ddd', color: '#333' } };
    localStorage.setItem('seatern:categoryColors:event-2', JSON.stringify(custom));

    const result = loadCategoryColors('event-2');
    // Should have defaults
    expect(result['男方']).toEqual(DEFAULT_CATEGORY_COLORS['男方']);
    // Should have custom
    expect(result['公司']).toEqual(custom['公司']);
  });
});
