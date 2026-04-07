import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

// Mock supabase client — CI 沒有 VITE_SUPABASE_URL/KEY，createClient 會 throw
vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
      signInWithPassword: vi.fn(),
      signInWithOAuth: vi.fn(),
      signUp: vi.fn(),
      signOut: vi.fn(),
      updateUser: vi.fn(),
      refreshSession: vi.fn().mockResolvedValue({ data: { user: null } }),
      getUser: vi.fn().mockResolvedValue({ data: { user: null } }),
      linkIdentity: vi.fn(),
      unlinkIdentity: vi.fn(),
    },
  },
}));
