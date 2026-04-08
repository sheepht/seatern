import { describe, it, expect, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import { useAuthStore } from '@/stores/auth';
import { ProtectedRoute } from '../ProtectedRoute';
import { renderWithRouter } from './test-utils';

beforeEach(() => {
  useAuthStore.setState({ user: null, session: null, isLoading: false });
});

describe('ProtectedRoute', () => {
  it('載入中 → 顯示載入文字', () => {
    useAuthStore.setState({ isLoading: true });
    renderWithRouter(<ProtectedRoute><div>保護內容</div></ProtectedRoute>);
    expect(screen.getByText('載入中...')).toBeInTheDocument();
    expect(screen.queryByText('保護內容')).not.toBeInTheDocument();
  });

  it('未登入 → 不顯示 children（重導到 /login）', () => {
    useAuthStore.setState({ user: null, isLoading: false });
    renderWithRouter(<ProtectedRoute><div>保護內容</div></ProtectedRoute>);
    expect(screen.queryByText('保護內容')).not.toBeInTheDocument();
  });

  it('已登入 → 顯示 children 和 header', () => {
    useAuthStore.setState({
      user: {
        id: 'u1',
        email: 'test@test.com',
        user_metadata: { name: '測試用戶' },
      } as unknown as ReturnType<typeof useAuthStore.getState>['user'],
      isLoading: false,
    });
    renderWithRouter(<ProtectedRoute><div>保護內容</div></ProtectedRoute>);
    expect(screen.getByText('保護內容')).toBeInTheDocument();
    expect(screen.getByText('測試用戶')).toBeInTheDocument();
    expect(screen.getByText('排位鷗鷗')).toBeInTheDocument();
    expect(screen.getByText('登出')).toBeInTheDocument();
  });

  it('已登入但沒有 name → 顯示 email', () => {
    useAuthStore.setState({
      user: {
        id: 'u1',
        email: 'test@test.com',
        user_metadata: {},
      } as ReturnType<typeof useAuthStore.getState>['user'],
      isLoading: false,
    });
    renderWithRouter(<ProtectedRoute><div>保護內容</div></ProtectedRoute>);
    expect(screen.getByText('test@test.com')).toBeInTheDocument();
  });
});
