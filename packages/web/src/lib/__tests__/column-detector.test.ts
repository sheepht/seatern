import { describe, it, expect } from 'vitest';
import { detectColumns, normalizeGuest, type ColumnMapping, type MultiColumnMapping } from '../column-detector';

// ─── detectColumns ───

describe('detectColumns', () => {
  it('偵測標準中文欄位名稱', () => {
    const headers = ['是否參加', '姓名', '暱稱', '分類', '子分類', '眷屬', '葷素', '想同桌人選', '避免同桌', '備註'];
    const { mapping, unmapped } = detectColumns(headers);
    expect(mapping.rsvpStatus).toBe('是否參加');
    expect(mapping.name).toBe('姓名');
    expect(mapping.aliases).toBe('暱稱');
    expect(mapping.category).toBe('分類');
    expect(mapping.subcategory).toBe('子分類');
    expect(mapping.companionCount).toBe('眷屬');
    expect(mapping.dietaryNote).toBe('葷素');
    expect(mapping.seatPreferences).toBe('想同桌人選');
    expect(mapping.avoidGuests).toBe('避免同桌');
    expect(mapping.specialNote).toBe('備註');
    expect(unmapped).toEqual([]);
  });

  it('偵測英文欄位名稱', () => {
    const headers = ['RSVP', 'Name', 'Nickname', 'Category', 'Group', 'Plus One', 'Dietary', 'Preference', 'Avoid', 'Note'];
    const { mapping } = detectColumns(headers);
    expect(mapping.rsvpStatus).toBe('RSVP');
    expect(mapping.name).toBe('Name');
    expect(mapping.aliases).toBe('Nickname');
    expect(mapping.seatPreferences).toBe('Preference');
    expect(mapping.avoidGuests).toBe('Avoid');
  });

  it('多欄位模式：想同桌 1、想同桌 2、想同桌 3', () => {
    const headers = ['姓名', '是否參加', '想同桌 1', '想同桌 2', '想同桌 3'];
    const { mapping, multiMapping } = detectColumns(headers);
    expect(mapping.seatPreferences).toBe('__multi__');
    expect(multiMapping.seatPreferences).toEqual(['想同桌 1', '想同桌 2', '想同桌 3']);
  });

  it('未辨識的欄位放進 unusedHeaders', () => {
    const headers = ['姓名', '是否參加', '血型', '星座'];
    const { unusedHeaders } = detectColumns(headers);
    expect(unusedHeaders).toContain('血型');
    expect(unusedHeaders).toContain('星座');
  });

  it('空 headers → 全部 unmapped', () => {
    const { unmapped } = detectColumns([]);
    expect(unmapped.length).toBeGreaterThan(0);
  });

  it('模糊匹配：「你要參加嗎」→ rsvpStatus', () => {
    const { mapping } = detectColumns(['你要參加嗎', '大名']);
    expect(mapping.rsvpStatus).toBe('你要參加嗎');
    expect(mapping.name).toBe('大名');
  });
});

// ─── normalizeGuest ───

describe('normalizeGuest', () => {
  const baseMapping: ColumnMapping = {
    name: '姓名',
    aliases: '暱稱',
    rsvpStatus: '是否參加',
    category: '分類',
    subcategory: '子分類',
    companionCount: '眷屬',
    dietaryNote: '葷素',
    specialNote: '備註',
    seatPreferences: '想同桌人選',
    avoidGuests: '避免同桌',
  };

  const emptyMulti: MultiColumnMapping = {
    name: [], aliases: [], rsvpStatus: [], category: [], subcategory: [],
    companionCount: [], dietaryNote: [], specialNote: [], seatPreferences: [], avoidGuests: [],
  };

  it('正常解析一列資料', () => {
    const row = {
      '是否參加': '是',
      '姓名': '周杰倫',
      '暱稱': 'Jay',
      '分類': '男方',
      '子分類': '華語歌壇',
      '眷屬': '1',
      '葷素': '葷',
      '想同桌人選': '蕭敬騰、陳信宏',
      '避免同桌': '蔡依林',
      '備註': '帶太太',
    };
    const guest = normalizeGuest(row, baseMapping, emptyMulti);
    expect(guest).not.toBeNull();
    expect(guest!.name).toBe('周杰倫');
    expect(guest!.aliases).toEqual(['Jay']);
    expect(guest!.category).toBe('男方');
    expect(guest!.rawSubcategory).toBe('華語歌壇');
    expect(guest!.rsvpStatus).toBe('confirmed');
    expect(guest!.companionCount).toBe(1);
    expect(guest!.dietaryNote).toBe('葷');
    expect(guest!.rawPreferences).toEqual(['蕭敬騰', '陳信宏']);
    expect(guest!.rawAvoids).toEqual(['蔡依林']);
    expect(guest!.specialNote).toBe('帶太太');
  });

  it('姓名為空 → 回傳 null', () => {
    const row = { '是否參加': '是', '姓名': '', '暱稱': '' };
    expect(normalizeGuest(row, baseMapping, emptyMulti)).toBeNull();
  });

  it('是否參加 = 否 → declined', () => {
    const row = { '是否參加': '否', '姓名': '測試' };
    const guest = normalizeGuest(row, baseMapping, emptyMulti);
    expect(guest!.rsvpStatus).toBe('declined');
  });

  it('是否參加 = 不會 → declined', () => {
    const row = { '是否參加': '不會', '姓名': '測試' };
    const guest = normalizeGuest(row, baseMapping, emptyMulti);
    expect(guest!.rsvpStatus).toBe('declined');
  });

  it('是否參加 = 是 → confirmed', () => {
    const row = { '是否參加': '是', '姓名': '測試' };
    const guest = normalizeGuest(row, baseMapping, emptyMulti);
    expect(guest!.rsvpStatus).toBe('confirmed');
  });

  it('眷屬文字：有 → 1', () => {
    const row = { '是否參加': '是', '姓名': '測試', '眷屬': '有' };
    const guest = normalizeGuest(row, baseMapping, emptyMulti);
    expect(guest!.companionCount).toBe(1);
  });

  it('眷屬文字：帶太太 → 1', () => {
    const row = { '是否參加': '是', '姓名': '測試', '眷屬': '帶太太' };
    const guest = normalizeGuest(row, baseMapping, emptyMulti);
    expect(guest!.companionCount).toBe(1);
  });

  it('眷屬數字：2 → 2', () => {
    const row = { '是否參加': '是', '姓名': '測試', '眷屬': '2' };
    const guest = normalizeGuest(row, baseMapping, emptyMulti);
    expect(guest!.companionCount).toBe(2);
  });

  it('眷屬上限 4', () => {
    const row = { '是否參加': '是', '姓名': '測試', '眷屬': '10' };
    const guest = normalizeGuest(row, baseMapping, emptyMulti);
    expect(guest!.companionCount).toBe(4);
  });

  it('眷屬空白 → 0', () => {
    const row = { '是否參加': '是', '姓名': '測試', '眷屬': '' };
    const guest = normalizeGuest(row, baseMapping, emptyMulti);
    expect(guest!.companionCount).toBe(0);
  });

  it('想同桌人選最多 3 位', () => {
    const row = { '是否參加': '是', '姓名': '測試', '想同桌人選': 'A、B、C、D' };
    const guest = normalizeGuest(row, baseMapping, emptyMulti);
    expect(guest!.rawPreferences).toHaveLength(3);
  });

  it('多欄位模式的想同桌', () => {
    const multiMapping = { ...emptyMulti, seatPreferences: ['想同桌 1', '想同桌 2', '想同桌 3'] };
    const mapping = { ...baseMapping, seatPreferences: '__multi__' as const };
    const row = { '是否參加': '是', '姓名': '測試', '想同桌 1': '周杰倫', '想同桌 2': '', '想同桌 3': '蕭敬騰' };
    const guest = normalizeGuest(row, mapping, multiMapping);
    expect(guest!.rawPreferences).toEqual(['周杰倫', '蕭敬騰']);
  });

  it('別名用逗號分隔', () => {
    const row = { '是否參加': '是', '姓名': '陳志明', '暱稱': '小明,阿明,David' };
    const guest = normalizeGuest(row, baseMapping, emptyMulti);
    expect(guest!.aliases).toEqual(['小明', '阿明', 'David']);
  });

  it('避免同桌用頓號分隔', () => {
    const row = { '是否參加': '是', '姓名': '測試', '避免同桌': '張三、李四' };
    const guest = normalizeGuest(row, baseMapping, emptyMulti);
    expect(guest!.rawAvoids).toEqual(['張三', '李四']);
  });
});
