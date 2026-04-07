import { describe, it, expect } from 'vitest';
import { diffGuests } from '../guest-diff';
import type { RawGuest } from '../column-detector';

function makeRawGuest(name: string, overrides: Partial<RawGuest> = {}): RawGuest {
  return {
    name,
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

describe('diffGuests', () => {
  it('全部是新賓客 → 全部在 newGuests，skippedGuests 為空', () => {
    const imported = [makeRawGuest('王小明'), makeRawGuest('李美玲')];
    const existing = [{ name: '張大華', aliases: [] }];
    const result = diffGuests(imported, existing);
    expect(result.newGuests).toHaveLength(2);
    expect(result.skippedGuests).toHaveLength(0);
  });

  it('全部已存在 → 全部在 skippedGuests，newGuests 為空', () => {
    const imported = [makeRawGuest('王小明'), makeRawGuest('李美玲')];
    const existing = [
      { name: '王小明', aliases: [] },
      { name: '李美玲', aliases: [] },
    ];
    const result = diffGuests(imported, existing);
    expect(result.newGuests).toHaveLength(0);
    expect(result.skippedGuests).toHaveLength(2);
  });

  it('混合新舊賓客', () => {
    const imported = [makeRawGuest('王小明'), makeRawGuest('李美玲'), makeRawGuest('陳志偉')];
    const existing = [{ name: '李美玲', aliases: [] }];
    const result = diffGuests(imported, existing);
    expect(result.newGuests).toHaveLength(2);
    expect(result.skippedGuests).toHaveLength(1);
    expect(result.skippedGuests[0].name).toBe('李美玲');
  });

  it('透過別名比對已存在賓客', () => {
    const imported = [makeRawGuest('小明')];
    const existing = [{ name: '王志明', aliases: ['小明', '阿明'] }];
    const result = diffGuests(imported, existing);
    expect(result.newGuests).toHaveLength(0);
    expect(result.skippedGuests).toHaveLength(1);
  });

  it('不分大小寫比對', () => {
    const imported = [makeRawGuest('David')];
    const existing = [{ name: 'david', aliases: [] }];
    const result = diffGuests(imported, existing);
    expect(result.newGuests).toHaveLength(0);
    expect(result.skippedGuests).toHaveLength(1);
  });

  it('自動 trim 空白比對', () => {
    const imported = [makeRawGuest('  王小明  ')];
    const existing = [{ name: '王小明', aliases: [] }];
    const result = diffGuests(imported, existing);
    expect(result.newGuests).toHaveLength(0);
    expect(result.skippedGuests).toHaveLength(1);
  });
});
