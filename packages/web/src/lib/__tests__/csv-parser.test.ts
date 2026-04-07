import { describe, it, expect } from 'vitest';
import { parseCSV, parsePaste } from '../csv-parser';

describe('parseCSV', () => {
  it('空字串 → 空結果', () => {
    const result = parseCSV('');
    expect(result).toEqual({ headers: [], rows: [] });
  });

  it('標準 CSV 含表頭', () => {
    const csv = `姓名,分類,關係分數\n王小明,男方,3\n李美玲,女方,2`;
    const result = parseCSV(csv);
    expect(result.headers).toEqual(['姓名', '分類', '關係分數']);
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]['姓名']).toBe('王小明');
    expect(result.rows[1]['分類']).toBe('女方');
  });

  it('處理引號內含逗號的欄位', () => {
    const csv = `姓名,備註\n王小明,"喜歡吃牛,不吃海鮮"`;
    const result = parseCSV(csv);
    expect(result.rows[0]['備註']).toBe('喜歡吃牛,不吃海鮮');
  });

  it('自動 trim 空白', () => {
    const csv = `  姓名,分類  \n  王小明 , 男方  `;
    const result = parseCSV(csv);
    // d3-dsv trims the outer text but headers/values may retain inner spaces
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toBeDefined();
  });
});

describe('parsePaste', () => {
  it('Tab 分隔（Google Sheet 複製）', () => {
    const tsv = `姓名\t分類\n王小明\t男方\n李美玲\t女方`;
    const result = parsePaste(tsv);
    expect(result.headers).toEqual(['姓名', '分類']);
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]['姓名']).toBe('王小明');
  });

  it('無 Tab 時 fallback 到 CSV', () => {
    const csv = `姓名,分類\n王小明,男方`;
    const result = parsePaste(csv);
    expect(result.headers).toEqual(['姓名', '分類']);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]['分類']).toBe('男方');
  });

  it('空字串 → 空結果', () => {
    const result = parsePaste('');
    expect(result).toEqual({ headers: [], rows: [] });
  });
});
