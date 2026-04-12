import { create } from 'zustand';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { api } from '@/lib/api';

interface AuthState {
  user: User | null
  session: Session | null
  isLoading: boolean
  setSession: (session: Session | null) => void
  signInWithEmail: (email: string, password: string) => Promise<void>
  signUpWithEmail: (email: string, password: string) => Promise<void>
  signInWithGoogle: () => Promise<void>
  signInWithLINE: () => Promise<void>
  claimEvent: () => Promise<{ migrated: boolean; message?: string }>
  devSignIn: (userId: string, name: string, email: string) => void
  signOut: () => Promise<void>
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  session: null,
  isLoading: true,

  setSession: (session) => {
    set({ session, user: session?.user ?? null, isLoading: false });
  },

  signInWithEmail: async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  },

  signUpWithEmail: async (email, password) => {
    const { error } = await supabase.auth.signUp({ email, password });
    if (error) throw error;
  },

  signInWithGoogle: async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/` },
    });
    if (error) throw error;
  },

  signInWithLINE: async () => {
    // LINE OAuth 由後端處理（Supabase 沒有內建 LINE provider）
    // 跳轉到 API 發起 LINE OAuth 流程
    window.location.href = '/api/auth/line';
  },

  claimEvent: async () => {
    try {
      // 把 localStorage 快取的 eventId 傳給後端，作為 cookie 遺失時的 fallback
      let cachedEventId: string | undefined;
      try {
        const raw = localStorage.getItem('seatern-event-cache');
        if (raw) cachedEventId = JSON.parse(raw)?.eventId;
      } catch { /* ignore */ }

      const res = await api.post('/auth/claim-event', {
        ...(cachedEventId ? { eventId: cachedEventId } : {}),
      });
      // Force seating store to reload the user's event
      const { useSeatingStore } = await import('./seating');
      const { clearEventCache } = await import('./seating');
      clearEventCache();
      useSeatingStore.setState({ eventId: null });
      return res.data;
    } catch {
      return { migrated: false };
    }
  },

  devSignIn: (userId, name, email) => {
    const fakeUser = {
      id: userId,
      email,
      user_metadata: { name },
      app_metadata: {},
      aud: 'authenticated',
      created_at: new Date().toISOString(),
    } as unknown as User;

    const fakeSession = {
      access_token: `dev-bypass-${userId}`,
      token_type: 'bearer',
      expires_in: 86400,
      refresh_token: '',
      user: fakeUser,
    } as unknown as Session;

    set({ user: fakeUser, session: fakeSession, isLoading: false });
  },

  signOut: async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    // Clear seating store so stale data doesn't leak into anonymous session
    const { useSeatingStore } = await import('./seating');
    useSeatingStore.setState({
      eventId: null,
      eventName: '',
      guests: [],
      tables: [],
      subcategories: [],
      avoidPairs: [],
      snapshots: [],
      tableLimit: 10,
      planStatus: null,
      planExpiresAt: null,
      tableLimitReached: false,
      tableLimitDismissed: false,
    });
    set({ user: null, session: null });
  },
}));
