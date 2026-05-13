// Server-only Supabase client with service role for admin operations (e.g. look up user by email)
// Use only in API routes or server actions; never expose to the client

import { createClient } from '@supabase/supabase-js'

export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  // #region agent log
  fetch('http://127.0.0.1:7642/ingest/f735a28b-d8f7-41dd-a66d-6dccf6bc8639',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'47277f'},body:JSON.stringify({sessionId:'47277f',runId:'post-fix',hypothesisId:'H2',location:'lib/supabase/admin.ts:9',message:'Create admin client env presence',data:{hasSupabaseUrl:Boolean(url),hasServiceRoleKey:Boolean(serviceRoleKey),serviceRoleKeyPrefix:typeof serviceRoleKey==='string'?serviceRoleKey.slice(0,8):null},timestamp:Date.now()})}).catch(()=>{});
  // #endregion
  if (!url || !serviceRoleKey) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  }
  return createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}
