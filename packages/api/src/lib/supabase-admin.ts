import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.VITE_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !serviceRoleKey) {
  console.warn(
    'Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY — LINE Login will not work',
  )
}

export const supabaseAdmin = createClient(supabaseUrl ?? '', serviceRoleKey ?? '', {
  auth: { autoRefreshToken: false, persistSession: false },
})
