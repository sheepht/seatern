import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ViolationModal } from '../workspace/ViolationModal';

describe('ViolationModal', () => {
  const baseProps = {
    guestName: '周杰倫',
    conflictName: '蔡依林',
    reason: '前任',
    onConfirm: vi.fn(),
    onCancel: vi.fn(),
  };

  it('顯示賓客名稱和衝突對象', () => {
    render(<ViolationModal {...baseProps} />);
    expect(screen.getByText('周杰倫')).toBeInTheDocument();
    expect(screen.getByText('蔡依林')).toBeInTheDocument();
  });

  it('顯示避免原因', () => {
    render(<ViolationModal {...baseProps} />);
    expect(screen.getByText('原因：前任')).toBeInTheDocument();
  });

  it('原因為 null → 不顯示原因欄', () => {
    render(<ViolationModal {...baseProps} reason={null} />);
    expect(screen.queryByText(/原因/)).not.toBeInTheDocument();
  });

  it('點擊「仍要安排」→ 呼叫 onConfirm', async () => {
    const onConfirm = vi.fn();
    render(<ViolationModal {...baseProps} onConfirm={onConfirm} />);
    await userEvent.click(screen.getByText('仍要安排'));
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it('點擊「取消」→ 呼叫 onCancel', async () => {
    const onCancel = vi.fn();
    render(<ViolationModal {...baseProps} onCancel={onCancel} />);
    await userEvent.click(screen.getByText('取消'));
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it('點擊背景遮罩 → 呼叫 onCancel', async () => {
    const onCancel = vi.fn();
    render(<ViolationModal {...baseProps} onCancel={onCancel} />);
    // 背景遮罩是最外層的 div
    const backdrop = screen.getByText('避免同桌警告').closest('.fixed');
    await userEvent.click(backdrop!);
    expect(onCancel).toHaveBeenCalled();
  });
});
