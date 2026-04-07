import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ImportPreview } from '../import/ImportPreview';
import type { ParseResult } from '@/lib/csv-parser';

vi.mock('@/hooks/useIsMobile', () => ({ useIsMobile: () => false }));

const sampleData: ParseResult = {
  headers: ['是否參加', '姓名', '分類'],
  rows: [
    { '是否參加': '是', '姓名': '周杰倫', '分類': '男方' },
    { '是否參加': '是', '姓名': '蔡依林', '分類': '女方' },
    { '是否參加': '否', '姓名': '林俊傑', '分類': '男方' },
  ],
};

describe('ImportPreview', () => {
  const baseProps = {
    data: sampleData,
    onConfirm: vi.fn(),
    onBack: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('顯示確認匯入按鈕', () => {
    render(<ImportPreview {...baseProps} />);
    expect(screen.getByRole('button', { name: /確認匯入/ })).toBeInTheDocument();
  });

  it('正確偵測欄位對應 — 顯示賓客數量', () => {
    render(<ImportPreview {...baseProps} />);
    // 偵測到 N 位賓客 in the summary badge
    expect(screen.getByText(/偵測到/)).toHaveTextContent('3');
  });

  it('點擊返回 → 呼叫 onBack', async () => {
    render(<ImportPreview {...baseProps} />);
    await userEvent.click(screen.getByText('返回'));
    expect(baseProps.onBack).toHaveBeenCalledOnce();
  });

  it('顯示賓客資料列', () => {
    render(<ImportPreview {...baseProps} />);
    expect(screen.getByText('周杰倫')).toBeInTheDocument();
    expect(screen.getByText('蔡依林')).toBeInTheDocument();
    expect(screen.getByText('林俊傑')).toBeInTheDocument();
  });
});
