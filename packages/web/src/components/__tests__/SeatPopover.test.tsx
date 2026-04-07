import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SeatPopover } from '../workspace/SeatPopover';
import { useSeatingStore } from '@/stores/seating';

describe('SeatPopover', () => {
  const baseProps = {
    tableId: 't1',
    seatIndex: 0,
    seatX: 100,
    seatY: 100,
    tableCenterX: 200,
    tableCenterY: 200,
    onClose: vi.fn(),
  };

  beforeEach(() => {
    useSeatingStore.setState({
      eventId: 'e1',
      guests: [
        {
          id: 'g1',
          name: '周杰倫',
          aliases: [],
          category: '男方',
          rsvpStatus: 'confirmed' as const,
          companionCount: 0,
          seatCount: 1,
          dietaryNote: '',
          specialNote: '',
          satisfactionScore: 70,
          assignedTableId: null,
          seatIndex: null,
          isOverflow: false,
          isIsolated: false,
          seatPreferences: [],
          subcategory: null,
        },
      ],
      tables: [
        {
          id: 't1',
          name: '第1桌',
          capacity: 10,
          positionX: 200,
          positionY: 200,
          averageSatisfaction: 0,
          color: null,
          note: null,
        },
      ],
      avoidPairs: [],
    });
  });

  it('顯示搜尋輸入框', () => {
    render(<SeatPopover {...baseProps} />);
    expect(screen.getByPlaceholderText(/搜尋/)).toBeInTheDocument();
  });

  it('搜尋框自動 focus', () => {
    render(<SeatPopover {...baseProps} />);
    const input = screen.getByPlaceholderText(/搜尋/);
    expect(document.activeElement).toBe(input);
  });
});
