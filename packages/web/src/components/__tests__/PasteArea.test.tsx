import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PasteArea } from '../import/PasteArea';

describe('PasteArea', () => {
  it('顯示 placeholder', () => {
    render(<PasteArea onParsed={vi.fn()} />);
    expect(screen.getByPlaceholderText(/從 Google Sheet 複製/)).toBeInTheDocument();
  });

  it('空白送出 → 顯示錯誤', async () => {
    render(<PasteArea onParsed={vi.fn()} />);
    const textarea = screen.getByPlaceholderText(/從 Google Sheet 複製/);
    // 先輸入一些東西讓按鈕出現，再清空
    await userEvent.type(textarea, 'temp');
    await userEvent.clear(textarea);
    await userEvent.type(textarea, ' ');
    await userEvent.click(screen.getByText('解析資料'));
    expect(screen.getByText('請先貼上資料')).toBeInTheDocument();
  });

  it('輸入有效 CSV → 按解析 → 呼叫 onParsed', async () => {
    const onParsed = vi.fn();
    render(<PasteArea onParsed={onParsed} />);
    const textarea = screen.getByPlaceholderText(/從 Google Sheet 複製/);
    await userEvent.type(textarea, '姓名,分類\n周杰倫,男方');
    await userEvent.click(screen.getByText('解析資料'));
    expect(onParsed).toHaveBeenCalledOnce();
    expect(onParsed.mock.calls[0][0].rows).toHaveLength(1);
  });

  it('輸入無法辨識的文字 → 顯示錯誤', async () => {
    render(<PasteArea onParsed={vi.fn()} />);
    const textarea = screen.getByPlaceholderText(/從 Google Sheet 複製/);
    await userEvent.type(textarea, '隨便打一些字');
    await userEvent.click(screen.getByText('解析資料'));
    expect(screen.getByText(/無法辨識表格格式/)).toBeInTheDocument();
  });

  it('未輸入文字 → 不顯示解析按鈕', () => {
    render(<PasteArea onParsed={vi.fn()} />);
    expect(screen.queryByText('解析資料')).not.toBeInTheDocument();
  });
});
