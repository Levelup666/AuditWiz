import { createClient } from '@supabase/supabase-js'

const TEMP_STORAGE_KEY = 'sb-auditwiz-hash-callback'

/**
 * Email invite / magic links often redirect with tokens in the URL hash (implicit flow).
 * `createBrowserClient` from `@supabase/ssr` always sets `flowType: 'pkce'`, which makes
 * GoTrue reject implicit URLs with AuthPKCEGrantCodeExchangeError ("Not a valid PKCE flow url").
 * This client is only for parsing the hash; transfer tokens to the app client via setSession.
 */
export function createImplicitHashCallbackClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        flowType: 'implicit',
        detectSessionInUrl: true,
        persistSession: true,
        autoRefreshToken: false,
        storageKey: TEMP_STORAGE_KEY,
        storage:
          typeof window !== 'undefined' ? window.localStorage : undefined,
      },
    }
  )
}
