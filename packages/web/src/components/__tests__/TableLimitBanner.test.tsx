import { describe, it, expect, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useAuthStore } from '@/stores/auth';
import { useSeatingStore } from '@/stores/seating';
import TableLimitBanner from '../workspace/TableLimitBanner';
import { renderWithRouter } from './test-utils';
import type { Table } from '@/lib/types';

function makeTables(count: number): Table[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `t${i}`,
    name: `第${i + 1}桌`,
    capacity: 10,
    positionX: 0,
    positionY: 0,
    averageSatisfaction: 0,
    color: null,
    note: null,
  }));
}

beforeEach(() => {
  useAuthStore.setState({ user: null, isLoading: false });
  useSeatingStore.setState({ tables: [] });
});

describe('TableLimitBanner', () => {
  it('桌數 < 8 → 不顯示', () => {
    useSeatingStore.setState({ tables: makeTables(5) });
    const { container } = renderWithRouter(<TableLimitBanner />);
    expect(container.innerHTML).toBe('');
  });

  it('已登入 → 不顯示', () => {
    useAuthStore.setState({ user: { id: 'u1' } as ReturnType<typeof useAuthStore.getState>['user'] });
    useSeatingStore.setState({ tables: makeTables(10) });
    const { container } = renderWithRouter(<TableLimitBanner />);
    expect(container.innerHTML).toBe('');
  });

  it('匿名 + 8 桌以上 → 顯示 banner', () => {
    useSeatingStore.setState({ tables: makeTables(8) });
    renderWithRouter(<TableLimitBanner />);
    expect(screen.getByText('登入即可排到 20 桌')).toBeInTheDocument();
    expect(screen.getByText('登入')).toBeInTheDocument();
  });

  it('點擊關閉 → banner 消失', async () => {
    useSeatingStore.setState({ tables: makeTables(8) });
    renderWithRouter(<TableLimitBanner />);
    expect(screen.getByText('登入即可排到 20 桌')).toBeInTheDocument();
    await userEvent.click(screen.getByLabelText('關閉'));
    expect(screen.queryByText('登入即可排到 20 桌')).not.toBeInTheDocument();
  });
});
