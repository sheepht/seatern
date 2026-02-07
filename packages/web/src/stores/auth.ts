import { create } from 'zustand'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'

interface AuthState {
  user: User | null
  session: Session | null
  isLoading: boolean
  setSession: (session: Session | null) => void
  signInWithEmail: (email: string, password: string) => Promise<void>
  signUpWithEmail: (email: string, password: string) => Promise<void>
  signInWithGoogle: () => Promise<void>
  signInWithLINE: () => Promise<void>
  devSignIn: (userId: string, name: string, email: string) => void
  signOut: () => Promise<void>
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  session: null,
  isLoading: true,

  setSession: (session) => {
    set({ session, user: session?.user ?? null, isLoading: false })
  },

  signInWithEmail: async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
  },

  signUpWithEmail: async (email, password) => {
    const { error } = await supabase.auth.signUp({ email, password })
    if (error) throw error
  },

  signInWithGoogle: async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/events` },
    })
    if (error) throw error
  },

  signInWithLINE: async () => {
    // LINE OAuth 由後端處理（Supabase 沒有內建 LINE provider）
    // 跳轉到 API 發起 LINE OAuth 流程
    window.location.href = `${import.meta.env.VITE_API_URL || 'http://localhost:3001'}/api/auth/line`
  },

  devSignIn: (userId, name, email) => {
    const fakeUser = {
      id: userId,
      email,
      user_metadata: { name },
      app_metadata: {},
      aud: 'authenticated',
      created_at: new Date().toISOString(),
    } as unknown as User

    const fakeSession = {
      access_token: `dev-bypass-${userId}`,
      token_type: 'bearer',
      expires_in: 86400,
      refresh_token: '',
      user: fakeUser,
    } as unknown as Session

    set({ user: fakeUser, session: fakeSession, isLoading: false })
  },

  signOut: async () => {
    const { error } = await supabase.auth.signOut()
    if (error) throw error
    set({ user: null, session: null })
  },
}))
