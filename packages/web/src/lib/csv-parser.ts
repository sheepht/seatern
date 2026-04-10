import { csvParse, tsvParse } from 'd3-dsv';

export interface ParseResult {
  headers: string[]
  rows: Record<string, string>[]
}

/**
 * 解析 CSV 文字（逗號分隔）
 */
export function parseCSV(text: string): ParseResult {
  const trimmed = text.replace(/^\uFEFF/, '').trim();
  if (!trimmed) return { headers: [], rows: [] };

  const rows = csvParse(trimmed);
  return {
    headers: rows.columns,
    rows: rows as unknown as Record<string, string>[],
  };
}

/**
 * 解析貼上的表格資料（Tab 分隔，從 Google Sheet 複製）
 */
export function parsePaste(text: string): ParseResult {
  const trimmed = text.replace(/^\uFEFF/, '').trim();
  if (!trimmed) return { headers: [], rows: [] };

  // 偵測分隔符號：Tab 優先（Sheet 複製），否則嘗試逗號
  const firstLine = trimmed.split('\n')[0];
  const hasTab = firstLine.includes('\t');

  if (hasTab) {
    const rows = tsvParse(trimmed);
    return {
      headers: rows.columns,
      rows: rows as unknown as Record<string, string>[],
    };
  }

  // Fallback to CSV
  return parseCSV(trimmed);
}

/**
 * 解析 XLSX 檔案（使用 SheetJS）
 */
export async function parseXLSX(file: File): Promise<ParseResult> {
  const { read, utils } = await import('xlsx');
  const buffer = await file.arrayBuffer();
  const workbook = read(buffer, { type: 'array' });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return { headers: [], rows: [] };

  const sheet = workbook.Sheets[sheetName];
  const jsonRows = utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
  if (jsonRows.length === 0) return { headers: [], rows: [] };

  const headers = Object.keys(jsonRows[0]);
  const rows = jsonRows.map((row) => {
    const record: Record<string, string> = {};
    for (const key of headers) {
      record[key] = String(row[key] ?? '');
    }
    return record;
  });

  return { headers, rows };
}

/**
 * 從 File 物件讀取文字內容
 */
export function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('檔案讀取失敗'));
    reader.readAsText(file);
  });
}
