import axios from 'axios'
import { supabase } from './supabase'
import { useAuthStore } from '@/stores/auth'

export const api = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
})

// Attach Bearer token to every request
api.interceptors.request.use(async (config) => {
  // Dev bypass：優先使用 store 中的 dev-bypass token
  const storeToken = useAuthStore.getState().session?.access_token
  if (storeToken?.startsWith('dev-bypass-')) {
    config.headers.Authorization = `Bearer ${storeToken}`
    return config
  }

  const { data: { session } } = await supabase.auth.getSession()
  if (session?.access_token) {
    config.headers.Authorization = `Bearer ${session.access_token}`
  }
  return config
})
