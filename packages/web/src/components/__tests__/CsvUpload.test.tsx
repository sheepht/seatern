import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CsvUpload } from '../import/CsvUpload';

describe('CsvUpload', () => {
  it('顯示上傳提示文字', () => {
    render(<CsvUpload onParsed={vi.fn()} />);
    expect(screen.getByText('上傳 CSV 或 Excel 檔案')).toBeInTheDocument();
  });

  it('上傳有效 CSV → 呼叫 onParsed', async () => {
    const onParsed = vi.fn();
    render(<CsvUpload onParsed={onParsed} />);

    const csv = '姓名,分類\n周杰倫,男方\n蔡依林,女方';
    const file = new File([csv], 'test.csv', { type: 'text/csv' });

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await userEvent.upload(input, file);

    // 等 async handleFile 完成
    await vi.waitFor(() => expect(onParsed).toHaveBeenCalledOnce());
    const result = onParsed.mock.calls[0][0];
    expect(result.headers).toContain('姓名');
    expect(result.rows).toHaveLength(2);
  });

  it('上傳不支援的格式 → 顯示錯誤', async () => {
    render(<CsvUpload onParsed={vi.fn()} />);

    // 繞過 accept 屬性限制，直接觸發 onChange
    const file = new File(['data'], 'test.pdf', { type: 'application/pdf' });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    Object.defineProperty(input, 'files', { value: [file] });
    input.dispatchEvent(new Event('change', { bubbles: true }));

    await vi.waitFor(() => {
      expect(screen.getByText(/檔案格式不支援/)).toBeInTheDocument();
    });
  });

  it('上傳空 CSV → 顯示錯誤', async () => {
    render(<CsvUpload onParsed={vi.fn()} />);

    const file = new File([''], 'empty.csv', { type: 'text/csv' });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await userEvent.upload(input, file);

    await vi.waitFor(() => {
      expect(screen.getByText('檔案內容為空')).toBeInTheDocument();
    });
  });
});
