import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AvoidPairModal } from '../workspace/AvoidPairModal';
import { useSeatingStore } from '@/stores/seating';

const guestA = {
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

const guestB = {
  ...guestA,
  id: 'g2',
  name: '蔡依林',
  category: '女方',
};

const guestC = {
  ...guestA,
  id: 'g3',
  name: '林俊傑',
};

describe('AvoidPairModal', () => {
  beforeEach(() => {
    useSeatingStore.setState({
      eventId: 'e1',
      guests: [guestA, guestB, guestC],
      tables: [],
      avoidPairs: [],
    });
  });

  it('顯示「避免同桌管理」標題', () => {
    render(<AvoidPairModal onClose={vi.fn()} />);
    expect(screen.getByText('避免同桌管理')).toBeInTheDocument();
  });

  it('顯示已存在的避免同桌組合', () => {
    useSeatingStore.setState({
      avoidPairs: [
        { id: 'ap1', guestAId: 'g1', guestBId: 'g2', reason: null },
      ],
    });
    render(<AvoidPairModal onClose={vi.fn()} />);
    expect(screen.getByText('周杰倫')).toBeInTheDocument();
    expect(screen.getByText('蔡依林')).toBeInTheDocument();
  });

  it('點擊關閉按鈕 → 呼叫 onClose', async () => {
    const onClose = vi.fn();
    render(<AvoidPairModal onClose={onClose} />);
    await userEvent.click(screen.getByText('✕'));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('沒有避免同桌 → 顯示提示文字', () => {
    render(<AvoidPairModal onClose={vi.fn()} />);
    expect(screen.getByText('尚未設定避桌關係')).toBeInTheDocument();
  });
});
