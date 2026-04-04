import axios from 'axios'
import { supabase } from './supabase'
import { useAuthStore } from '@/stores/auth'

export const api = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
})

async function getAuthHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = {}

  // Dev bypass：優先使用 store 中的 dev-bypass token
  const storeToken = useAuthStore.getState().session?.access_token
  if (storeToken?.startsWith('dev-bypass-')) {
    headers.Authorization = `Bearer ${storeToken}`
    return headers
  }

  const { data: { session } } = await supabase.auth.getSession()
  if (session?.access_token) {
    headers.Authorization = `Bearer ${session.access_token}`
  }
  return headers
}

// Attach Bearer token to every request
api.interceptors.request.use(async (config) => {
  const headers = await getAuthHeaders()
  Object.assign(config.headers, headers)
  return config
})

/**
 * Auth-aware fetch wrapper. Drop-in replacement for fetch() that
 * automatically attaches Bearer token + credentials: 'include'.
 */
export async function authFetch(input: string, init?: RequestInit): Promise<Response> {
  const headers = await getAuthHeaders()
  return fetch(input, {
    ...init,
    credentials: 'include',
    headers: {
      ...headers,
      ...init?.headers,
    },
  })
}
