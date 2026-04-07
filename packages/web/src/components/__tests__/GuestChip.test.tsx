import { describe, it, expect, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import { useSeatingStore } from '@/stores/seating';
import { GuestChip } from '../workspace/GuestChip';
import { renderWithDnd } from './test-utils';
import type { Guest } from '@/lib/types';

function makeGuest(overrides: Partial<Guest> = {}): Guest {
  return {
    id: 'g1', name: '周杰倫', aliases: ['Jay'], category: '男方',
    rsvpStatus: 'confirmed', companionCount: 0, seatCount: 1,
    dietaryNote: '', specialNote: '', satisfactionScore: 80,
    assignedTableId: null, seatIndex: null,
    isOverflow: false, isIsolated: false, seatPreferences: [], subcategory: null,
    ...overrides,
  };
}

beforeEach(() => {
  useSeatingStore.setState({
    eventId: 'e1', guests: [], tables: [], avoidPairs: [],
    bestSwapTableId: null, longPressActive: false,
  });
});

describe('GuestChip', () => {
  it('顯示暱稱（優先於姓名）', () => {
    renderWithDnd(<GuestChip guest={makeGuest({ aliases: ['Jay'] })} />);
    expect(screen.getByText('Jay')).toBeInTheDocument();
  });

  it('沒有暱稱 → 顯示姓名', () => {
    renderWithDnd(<GuestChip guest={makeGuest({ name: '蕭敬騰', aliases: [] })} />);
    expect(screen.getByText('蕭敬騰')).toBeInTheDocument();
  });

  it('有眷屬 → 顯示 +N', () => {
    renderWithDnd(<GuestChip guest={makeGuest({ companionCount: 2 })} />);
    expect(screen.getByText('+2')).toBeInTheDocument();
  });

  it('無眷屬 → 不顯示 +N', () => {
    renderWithDnd(<GuestChip guest={makeGuest({ companionCount: 0 })} />);
    expect(screen.queryByText(/\+\d/)).not.toBeInTheDocument();
  });

  it('title 包含完整資訊', () => {
    const guest = makeGuest({ name: '周杰倫', aliases: ['Jay'], companionCount: 1, dietaryNote: '素食' });
    renderWithDnd(<GuestChip guest={guest} />);
    const chip = screen.getByTitle(/周杰倫.*Jay.*\+1.*素食/);
    expect(chip).toBeInTheDocument();
  });
});
