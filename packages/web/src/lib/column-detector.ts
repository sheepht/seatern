/**
 * 欄位自動偵測：將 Google Sheet 的欄位名稱對應到系統欄位
 *
 * 比對演算法：case-insensitive 子字串包含
 * 例如欄位名稱包含「姓名」就對應到 name
 */

export type SystemField =
  | 'name'
  | 'aliases'
  | 'rsvpStatus'
  | 'category'
  | 'subcategory'
  | 'companionCount'
  | 'dietaryNote'
  | 'specialNote'
  | 'seatPreferences'
  | 'avoidGuests'

export interface FieldMapping {
  field: SystemField
  label: string
  required: boolean
}

/** 系統欄位定義 */
export const SYSTEM_FIELDS: FieldMapping[] = [
  { field: 'rsvpStatus', label: '是否參加', required: true },
  { field: 'name', label: '姓名', required: true },
  { field: 'aliases', label: '外號/暱稱', required: false },
  { field: 'category', label: '分類（男方/女方）', required: false },
  { field: 'subcategory', label: '子分類', required: false },
  { field: 'companionCount', label: '攜眷', required: false },
  { field: 'dietaryNote', label: '葷素/飲食', required: false },
  { field: 'specialNote', label: '備註/特殊需求', required: false },
  { field: 'seatPreferences', label: '想同桌人選', required: false },
  { field: 'avoidGuests', label: '避免同桌', required: false },
];

/** 每個系統欄位的關鍵字（用於子字串比對） */
const FIELD_KEYWORDS: Record<SystemField, string[]> = {
  rsvpStatus: ['參加', '出席', '是否參加', 'rsvp', 'attend', '你要參加嗎', '是否出席', '要來嗎', '會來嗎', '能來嗎', '出不出席'],
  name: ['姓名', '名字', 'name', '全名', '大名', '稱呼'],
  aliases: ['外號', '暱稱', '別名', 'alias', 'nickname', '綽號', '小名'],
  category: ['分類', '男方女方', '類別', 'category', '來賓分類', '哪一方'],
  subcategory: ['子分類', '群組', '標籤', '分組', 'group', 'tag', '圈子', 'subcategory', '關係'],
  companionCount: ['眷屬', '+1', '攜伴', '帶人', 'plus one', 'guest count', '攜眷', '帶幾位', '帶人嗎', '幾位大人', '大人人數', '加一', '攜帶'],
  dietaryNote: ['葷素', '飲食', 'dietary', '素食', '忌口', '吃素', '有沒有忌口', '餐食', '葷或素', '飲食需求'],
  specialNote: ['備註', '需求', '特殊', 'note', '其他', '補充', '特殊需求', '嬰兒椅', '輪椅'],
  seatPreferences: ['同桌', '想跟誰坐', 'preference', '想坐', '同桌人選', '希望同桌', '想坐旁邊', '想跟誰'],
  avoidGuests: ['避免', '避桌', '不同桌', 'avoid', '迴避', '不想同桌'],
};

/** 想同桌的多欄位模式（「想同桌 1」「想同桌 2」「想同桌 3」） */
const SEAT_PREF_MULTI_KEYWORDS = ['想同桌', '同桌人選', 'preference'];

export type ColumnMapping = Record<SystemField, string | null>
export type MultiColumnMapping = Record<SystemField, string[]>

export interface DetectionResult {
  /** 單欄位對應 */
  mapping: ColumnMapping
  /** 多欄位對應（目前只有 seatPreferences 可能有多欄） */
  multiMapping: MultiColumnMapping
  /** 未成功對應的系統欄位 */
  unmapped: SystemField[]
  /** 未被對應的 Sheet 欄位 */
  unusedHeaders: string[]
}

/**
 * 自動偵測欄位對應
 */
export function detectColumns(headers: string[]): DetectionResult {
  const mapping: ColumnMapping = {
    name: null,
    aliases: null,
    rsvpStatus: null,
    category: null,
    subcategory: null,
    companionCount: null,
    dietaryNote: null,
    specialNote: null,
    seatPreferences: null,
    avoidGuests: null,
  };

  const multiMapping: MultiColumnMapping = {
    name: [],
    aliases: [],
    rsvpStatus: [],
    category: [],
    subcategory: [],
    companionCount: [],
    dietaryNote: [],
    specialNote: [],
    seatPreferences: [],
    avoidGuests: [],
  };

  const usedHeaders = new Set<string>();

  // 先檢查「想同桌」多欄位模式（想同桌 1, 想同桌 2, 想同桌 3）
  const seatPrefHeaders = headers.filter((h) => {
    const lower = h.toLowerCase();
    return SEAT_PREF_MULTI_KEYWORDS.some((kw) => lower.includes(kw));
  });

  if (seatPrefHeaders.length > 1) {
    // 多欄位模式
    multiMapping.seatPreferences = seatPrefHeaders;
    seatPrefHeaders.forEach((h) => usedHeaders.add(h));
    mapping.seatPreferences = '__multi__'; // 標記為多欄位
  }

  // 對每個系統欄位嘗試比對
  for (const sysField of SYSTEM_FIELDS) {
    if (mapping[sysField.field] !== null) continue; // 已被多欄位模式處理

    const keywords = FIELD_KEYWORDS[sysField.field];

    for (const header of headers) {
      if (usedHeaders.has(header)) continue;

      const headerLower = header.toLowerCase();
      const matched = keywords.some((kw) => headerLower.includes(kw.toLowerCase()));

      if (matched) {
        mapping[sysField.field] = header;
        usedHeaders.add(header);
        break;
      }
    }
  }

  const unmapped = SYSTEM_FIELDS
    .filter((f) => mapping[f.field] === null)
    .map((f) => f.field);

  const unusedHeaders = headers.filter((h) => !usedHeaders.has(h));

  return { mapping, multiMapping, unmapped, unusedHeaders };
}

/**
 * 將原始列轉換成標準化的賓客資料
 */
import type { RsvpStatus } from '@/lib/types';

export interface RawGuest {
  name: string
  aliases: string[]
  category: string
  rsvpStatus: RsvpStatus
  companionCount: number
  dietaryNote: string
  specialNote: string
  rawSubcategory: string   // 子分類（大學同學、高中同學等）
  rawPreferences: string[] // 未配對的原始文字
  rawAvoids: string[]      // 避免同桌的人名
}

export function normalizeGuest(
  row: Record<string, string>,
  mapping: ColumnMapping,
  multiMapping: MultiColumnMapping,
): RawGuest | null {
  const get = (field: SystemField): string => {
    const col = mapping[field];
    if (!col || col === '__multi__') return '';
    return (row[col] || '').trim();
  };

  const name = get('name');
  if (!name) return null; // 姓名為空，跳過

  // 解析別名
  const aliasStr = get('aliases');
  const aliases = aliasStr
    ? aliasStr.split(/[,，、]/).map((a) => a.trim()).filter(Boolean)
    : [];

  // 解析 RSVP
  const rsvpRaw = get('rsvpStatus').toLowerCase();
  let rsvpStatus: RsvpStatus = 'confirmed';
  if (['否', '不', '婉拒', 'no', 'n', '0', 'false', '不會'].some((k) => rsvpRaw.includes(k))) {
    rsvpStatus = 'declined';
  }

  // 解析子分類
  const rawSubcategory = (get('subcategory') || '').trim();

  // 解析攜眷：0-4，代表額外攜帶的人數（含大人和小孩）
  // 支援多種填法：數字（0, 1, 2）、文字（有、是、帶老婆）、混合（1位、帶1人）
  const extraRaw = get('companionCount').toLowerCase();
  let extra: number;
  const numMatch = extraRaw.match(/\d+/);
  if (numMatch) {
    extra = parseInt(numMatch[0], 10);
  } else if (['有', '是', 'yes', 'y', '帶'].some((k) => extraRaw.includes(k))) {
    extra = 1;
  } else if (['無', '否', '沒', 'no', 'n'].some((k) => extraRaw.includes(k)) || extraRaw === '') {
    extra = 0;
  } else {
    extra = 0;
  }
  const companionCount = Math.min(4, Math.max(0, extra));

  // 解析想同桌人選
  let rawPreferences: string[] = [];
  if (mapping.seatPreferences === '__multi__') {
    // 多欄位模式
    rawPreferences = multiMapping.seatPreferences
      .map((col) => (row[col] || '').trim())
      .filter(Boolean);
  } else {
    const prefStr = get('seatPreferences');
    if (prefStr) {
      rawPreferences = prefStr
        .split(/[,，、\n\s]+/)
        .map((p) => p.trim())
        .filter(Boolean)
        .slice(0, 3); // 最多 3 位
    }
  }

  // 解析避免同桌
  const avoidStr = get('avoidGuests');
  const rawAvoids = avoidStr
    ? avoidStr.split(/[,，、\n\s]+/).map((p) => p.trim()).filter(Boolean)
    : [];

  return {
    name,
    aliases,
    category: get('category') || '',
    rsvpStatus,
    rawSubcategory,
    companionCount,
    dietaryNote: get('dietaryNote'),
    specialNote: get('specialNote'),
    rawPreferences,
    rawAvoids,
  };
}
