import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DragOverlayContent } from '../workspace/DragOverlayContent';
import { useSeatingStore, type Guest } from '@/stores/seating';

function makeGuest(overrides: Partial<Guest> = {}): Guest {
  return {
    id: 'g1',
    name: '王小明',
    aliases: [],
    category: '男方',
    rsvpStatus: 'confirmed',
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
    ...overrides,
  };
}

describe('DragOverlayContent', () => {
  beforeEach(() => {
    useSeatingStore.setState({
      eventId: 'e1',
      guests: [],
      avoidPairs: [],
      dragPreview: null,
    });
  });

  it('顯示賓客名稱 — 2 字以下直接顯示', () => {
    const guest = makeGuest({ name: '小明' });
    render(<DragOverlayContent guest={guest} />);
    expect(screen.getByText('小明')).toBeInTheDocument();
  });

  it('顯示賓客名稱 — 超過 2 字取後 2 字', () => {
    const guest = makeGuest({ name: '王小明' });
    render(<DragOverlayContent guest={guest} />);
    expect(screen.getByText('小明')).toBeInTheDocument();
  });

  it('有暱稱時優先使用暱稱（3 字以下直接顯示）', () => {
    const guest = makeGuest({ name: '王小明', aliases: ['阿明'] });
    render(<DragOverlayContent guest={guest} />);
    expect(screen.getByText('阿明')).toBeInTheDocument();
  });

  it('有眷屬 → 顯示 +N badge', () => {
    const guest = makeGuest({ companionCount: 2 });
    render(<DragOverlayContent guest={guest} />);
    expect(screen.getByText('+2')).toBeInTheDocument();
  });

  it('無眷屬 → 不顯示 +N badge', () => {
    const guest = makeGuest({ companionCount: 0 });
    render(<DragOverlayContent guest={guest} />);
    expect(screen.queryByText(/^\+\d+$/)).not.toBeInTheDocument();
  });

  it('無 dragPreview → 不顯示分數變化 badge', () => {
    useSeatingStore.setState({ dragPreview: null });
    const guest = makeGuest({ satisfactionScore: 70 });
    render(<DragOverlayContent guest={guest} />);
    // delta badge shows "+N" or "-N" — should not exist
    expect(screen.queryByText(/^[+-]\d+$/)).not.toBeInTheDocument();
  });
});
