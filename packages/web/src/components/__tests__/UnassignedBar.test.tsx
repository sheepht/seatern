import { describe, it, expect, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import { useSeatingStore } from '@/stores/seating';
import { UnassignedBar } from '../workspace/UnassignedBar';
import { renderWithDnd } from './test-utils';
import type { Guest } from '@/lib/types';

function makeGuest(overrides: Partial<Guest> = {}): Guest {
  return {
    id: 'g1', name: '測試', aliases: [], category: '男方',
    rsvpStatus: 'confirmed', companionCount: 0, seatCount: 1,
    dietaryNote: '', specialNote: '', satisfactionScore: 0,
    assignedTableId: null, seatIndex: null,
    isOverflow: false, isIsolated: false, seatPreferences: [], subcategory: null,
    ...overrides,
  };
}

beforeEach(() => {
  useSeatingStore.setState({
    eventId: 'e1', guests: [], tables: [], avoidPairs: [],
    bestSwapTableId: null,
  });
});

describe('UnassignedBar', () => {
  it('沒有未安排賓客 → 顯示「所有賓客都已安排」', () => {
    useSeatingStore.setState({ guests: [makeGuest({ assignedTableId: 't1' })] });
    renderWithDnd(<UnassignedBar />);
    expect(screen.getByText('所有賓客都已安排')).toBeInTheDocument();
  });

  it('有未安排賓客 → 顯示人數和席數', () => {
    useSeatingStore.setState({
      guests: [
        makeGuest({ id: 'g1', name: '周杰倫', assignedTableId: null }),
        makeGuest({ id: 'g2', name: '蕭敬騰', assignedTableId: null, companionCount: 1, seatCount: 2 }),
      ],
    });
    renderWithDnd(<UnassignedBar />);
    // 2 人 / 3 席
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('婉拒的賓客不計入未安排', () => {
    useSeatingStore.setState({
      guests: [
        makeGuest({ id: 'g1', rsvpStatus: 'declined', assignedTableId: null }),
      ],
    });
    renderWithDnd(<UnassignedBar />);
    expect(screen.getByText('所有賓客都已安排')).toBeInTheDocument();
  });
});
