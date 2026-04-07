import { describe, it, expect, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import { useAuthStore } from '@/stores/auth';
import { MobileBottomNav } from '../mobile/MobileBottomNav';
import { renderWithRouter } from './test-utils';

beforeEach(() => {
  useAuthStore.setState({ user: null, isLoading: false });
});

describe('MobileBottomNav', () => {
  it('未登入 → 顯示排位、賓客、匯入、登入', () => {
    renderWithRouter(<MobileBottomNav />);
    expect(screen.getByText('排位')).toBeInTheDocument();
    expect(screen.getByText('賓客')).toBeInTheDocument();
    expect(screen.getByText('匯入')).toBeInTheDocument();
    expect(screen.getByText('登入')).toBeInTheDocument();
    expect(screen.queryByText('設定')).not.toBeInTheDocument();
  });

  it('已登入 → 顯示排位、賓客、匯入、設定', () => {
    useAuthStore.setState({
      user: {
        id: 'u1',
        email: 'test@test.com',
        is_anonymous: false,
        user_metadata: {},
      } as ReturnType<typeof useAuthStore.getState>['user'],
    });
    renderWithRouter(<MobileBottomNav />);
    expect(screen.getByText('排位')).toBeInTheDocument();
    expect(screen.getByText('設定')).toBeInTheDocument();
    expect(screen.queryByText('登入')).not.toBeInTheDocument();
  });

  it('匿名用戶 (is_anonymous) → 顯示登入', () => {
    useAuthStore.setState({
      user: {
        id: 'u1',
        is_anonymous: true,
        user_metadata: {},
      } as ReturnType<typeof useAuthStore.getState>['user'],
    });
    renderWithRouter(<MobileBottomNav />);
    expect(screen.getByText('登入')).toBeInTheDocument();
    expect(screen.queryByText('設定')).not.toBeInTheDocument();
  });

  it('有 navigation role', () => {
    renderWithRouter(<MobileBottomNav />);
    expect(screen.getByRole('navigation')).toBeInTheDocument();
  });
});
