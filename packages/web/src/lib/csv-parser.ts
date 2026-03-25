import { csvParse, tsvParse } from 'd3-dsv'

export interface ParseResult {
  headers: string[]
  rows: Record<string, string>[]
}

/**
 * 解析 CSV 文字（逗號分隔）
 */
export function parseCSV(text: string): ParseResult {
  const trimmed = text.trim()
  if (!trimmed) return { headers: [], rows: [] }

  const rows = csvParse(trimmed)
  return {
    headers: rows.columns,
    rows: rows as unknown as Record<string, string>[],
  }
}

/**
 * 解析貼上的表格資料（Tab 分隔，從 Google Sheet 複製）
 */
export function parsePaste(text: string): ParseResult {
  const trimmed = text.trim()
  if (!trimmed) return { headers: [], rows: [] }

  // 偵測分隔符號：Tab 優先（Sheet 複製），否則嘗試逗號
  const firstLine = trimmed.split('\n')[0]
  const hasTab = firstLine.includes('\t')

  if (hasTab) {
    const rows = tsvParse(trimmed)
    return {
      headers: rows.columns,
      rows: rows as unknown as Record<string, string>[],
    }
  }

  // Fallback to CSV
  return parseCSV(trimmed)
}

/**
 * 從 File 物件讀取文字內容
 */
export function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(new Error('檔案讀取失敗'))
    reader.readAsText(file)
  })
}
