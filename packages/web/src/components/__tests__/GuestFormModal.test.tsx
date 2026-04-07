import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import GuestFormModal from '../GuestFormModal';

vi.mock('@/hooks/useIsMobile', () => ({ useIsMobile: () => false }));

const baseProps = {
  mode: 'add' as const,
  categories: ['男方', '女方', '共同'],
  subcategories: [],
  tables: [],
  guests: [],
  avoidPairs: [],
  categoryColors: {},
  onSubmit: vi.fn().mockResolvedValue(undefined),
  onClose: vi.fn(),
};

describe('GuestFormModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('mode=add → 顯示「新增賓客」標題', () => {
    render(<GuestFormModal {...baseProps} />);
    expect(screen.getByRole('heading', { name: '新增賓客' })).toBeInTheDocument();
  });

  it('mode=edit → 顯示賓客名稱相關標題', () => {
    const guest = {
      id: 'g1',
      name: '周杰倫',
      aliases: [],
      category: '男方',
      rsvpStatus: 'confirmed' as const,
      companionCount: 0,
      seatCount: 1,
      dietaryNote: '',
      specialNote: '',
      satisfactionScore: 75,
      assignedTableId: null,
      seatIndex: null,
      isOverflow: false,
      isIsolated: false,
      seatPreferences: [],
      subcategory: null,
    };
    render(<GuestFormModal {...baseProps} mode="edit" guest={guest} />);
    expect(screen.getByText('周杰倫的詳細資訊')).toBeInTheDocument();
  });

  it('顯示姓名輸入框', () => {
    render(<GuestFormModal {...baseProps} />);
    // The "姓名" label should exist
    expect(screen.getByText('姓名')).toBeInTheDocument();
  });

  it('點擊背景遮罩 → 呼叫 onClose', async () => {
    const onClose = vi.fn();
    render(<GuestFormModal {...baseProps} onClose={onClose} />);
    // The backdrop is the outermost fixed div
    const backdrop = screen.getByRole('heading', { name: '新增賓客' }).closest('.fixed');
    await userEvent.click(backdrop!);
    expect(onClose).toHaveBeenCalled();
  });

  it('填入姓名後送出 → 呼叫 onSubmit', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<GuestFormModal {...baseProps} onSubmit={onSubmit} />);
    // Find the name input — it's associated with the 姓名 label
    // The FieldInput renders an <input> element
    const inputs = screen.getAllByRole('textbox');
    // First textbox should be the name input
    const nameInput = inputs[0];
    await userEvent.type(nameInput, '蔡依林');
    // Blur to commit
    await userEvent.tab();

    // Click submit button — the button text is '新增賓客' (same as title)
    const submitBtn = screen.getByRole('button', { name: '新增賓客' });
    await userEvent.click(submitBtn);

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledOnce();
    });
    expect(onSubmit.mock.calls[0][0].name).toBe('蔡依林');
  });
});
