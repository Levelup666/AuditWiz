import type { SupabaseClient } from '@supabase/supabase-js'
import { userNeedsOrcidEmailCapture } from '@/lib/auth/orcid-email-requirements'

const ORCID_EMAIL_GATE_ALLOW_PREFIXES = [
  '/auth/',
  '/account/setup',
  '/api/auth/sync-orcid-from-session',
  '/invite/',
  '/auditor',
  '/invites',
] as const

export function pathBypassesOrcidEmailGate(pathname: string): boolean {
  if (pathname.startsWith('/_next')) return true
  if (pathname === '/favicon.ico') return true
  return ORCID_EMAIL_GATE_ALLOW_PREFIXES.some((p) => pathname.startsWith(p))
}

export async function userNeedsOrcidEmailGateRedirect(
  supabase: SupabaseClient,
  userId: string,
  user: Parameters<typeof userNeedsOrcidEmailCapture>[0]
): Promise<boolean> {
  const { data: profile } = await supabase
    .from('profiles')
    .select('orcid_id, orcid_verified, orcid_email_locked')
    .eq('id', userId)
    .maybeSingle()

  return userNeedsOrcidEmailCapture(user, profile)
}
