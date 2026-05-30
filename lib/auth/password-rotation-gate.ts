import type { SupabaseClient } from '@supabase/supabase-js'
import {
  isPasswordRotationExpired,
  needsPasswordRotationSetup,
  userSubjectToPasswordPolicy,
} from '@/lib/auth/password-policy'

const PASSWORD_GATE_ALLOW_PREFIXES = [
  '/auth/',
  '/account/setup',
  '/account/security',
  '/api/auth/',
] as const

export function pathBypassesPasswordGate(pathname: string): boolean {
  if (pathname.startsWith('/_next')) return true
  if (pathname === '/favicon.ico') return true
  return PASSWORD_GATE_ALLOW_PREFIXES.some((p) => pathname.startsWith(p))
}

export type PasswordGateReason = 'password_expired' | 'rotation_required'

export async function getPasswordGateRedirect(
  supabase: SupabaseClient,
  userId: string,
  user: Parameters<typeof userSubjectToPasswordPolicy>[0],
  pathname: string
): Promise<{ redirect: true; reason: PasswordGateReason } | { redirect: false }> {
  if (pathBypassesPasswordGate(pathname)) {
    return { redirect: false }
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select(
      'password_policy_legacy, password_rotation_days, password_last_changed_at, orcid_email_locked'
    )
    .eq('id', userId)
    .maybeSingle()

  if (!userSubjectToPasswordPolicy(user, profile)) {
    return { redirect: false }
  }

  if (needsPasswordRotationSetup(profile, user)) {
    return { redirect: true, reason: 'rotation_required' }
  }

  if (
    isPasswordRotationExpired({
      passwordLastChangedAt: profile?.password_last_changed_at,
      rotationDays: profile?.password_rotation_days,
    })
  ) {
    return { redirect: true, reason: 'password_expired' }
  }

  return { redirect: false }
}
