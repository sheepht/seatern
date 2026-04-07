import { describe, it, expect, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useAuthStore } from '@/stores/auth';
import { useSeatingStore } from '@/stores/seating';
import TableLimitModal from '../workspace/TableLimitModal';
import { renderWithRouter } from './test-utils';
import type { Table } from '@/lib/types';

function makeTables(count: number): Table[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `t${i}`, name: `第${i + 1}桌`, capacity: 10,
    positionX: 0, positionY: 0, averageSatisfaction: 0, color: null, note: null,
  }));
}

beforeEach(() => {
  useAuthStore.setState({ user: null, isLoading: false });
  useSeatingStore.setState({ tableLimitReached: false, tables: [], tableLimit: 10 });
});

describe('TableLimitModal', () => {
  it('tableLimitReached=false → 不顯示', () => {
    const { container } = renderWithRouter(<TableLimitModal />);
    expect(container.innerHTML).toBe('');
  });

  it('匿名用戶 → 顯示登入提示', () => {
    useSeatingStore.setState({ tableLimitReached: true, tables: makeTables(10), tableLimit: 10 });
    renderWithRouter(<TableLimitModal />);
    expect(screen.getByText('解鎖更多桌數')).toBeInTheDocument();
    expect(screen.getByText('LINE 登入')).toBeInTheDocument();
    expect(screen.getByText('Google 登入')).toBeInTheDocument();
    expect(screen.getByText('Email 登入')).toBeInTheDocument();
  });

  it('已登入用戶 → 顯示升級提示', () => {
    useAuthStore.setState({ user: { id: 'u1' } as ReturnType<typeof useAuthStore.getState>['user'] });
    useSeatingStore.setState({ tableLimitReached: true, tables: makeTables(20), tableLimit: 20 });
    renderWithRouter(<TableLimitModal />);
    expect(screen.getByText(/已達到 20 桌上限/)).toBeInTheDocument();
    expect(screen.getByText('升級方案')).toBeInTheDocument();
  });

  it('點擊「稍後再說」→ modal 消失', async () => {
    useSeatingStore.setState({ tableLimitReached: true, tables: makeTables(10) });
    renderWithRouter(<TableLimitModal />);
    expect(screen.getByText('解鎖更多桌數')).toBeInTheDocument();
    await userEvent.click(screen.getByText('稍後再說'));
    expect(screen.queryByText('解鎖更多桌數')).not.toBeInTheDocument();
  });
});
