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

export type PasswordGateRedirect =
  | { redirect: true; reason: PasswordGateReason; pathname: '/account/setup' | '/account/security' }
  | { redirect: false }

/** First-time credential policy belongs on account setup, not the settings security page. */
export function passwordGatePathnameForReason(
  reason: PasswordGateReason,
  profile: { account_setup_completed_at?: string | null } | null | undefined
): '/account/setup' | '/account/security' {
  if (reason === 'rotation_required' && !profile?.account_setup_completed_at) {
    return '/account/setup'
  }
  return '/account/security'
}

export async function getPasswordGateRedirect(
  supabase: SupabaseClient,
  userId: string,
  user: Parameters<typeof userSubjectToPasswordPolicy>[0],
  pathname: string
): Promise<PasswordGateRedirect> {
  if (pathBypassesPasswordGate(pathname)) {
    return { redirect: false }
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select(
      'password_policy_legacy, password_rotation_days, password_last_changed_at, orcid_email_locked, account_setup_completed_at'
    )
    .eq('id', userId)
    .maybeSingle()

  if (!userSubjectToPasswordPolicy(user, profile)) {
    return { redirect: false }
  }

  if (needsPasswordRotationSetup(profile, user)) {
    return {
      redirect: true,
      reason: 'rotation_required',
      pathname: passwordGatePathnameForReason('rotation_required', profile),
    }
  }

  if (
    isPasswordRotationExpired({
      passwordLastChangedAt: profile?.password_last_changed_at,
      rotationDays: profile?.password_rotation_days,
    })
  ) {
    return {
      redirect: true,
      reason: 'password_expired',
      pathname: '/account/security',
    }
  }

  return { redirect: false }
}
