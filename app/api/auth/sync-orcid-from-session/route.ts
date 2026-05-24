import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { syncVerifiedOrcidFromSession } from '@/lib/auth/sync-verified-orcid'
import { syncOrcidEmailForUser } from '@/lib/auth/sync-orcid-email'
import { userNeedsOrcidEmailCapture } from '@/lib/auth/orcid-email-requirements'

/**
 * Persists verified ORCID from Supabase Auth (custom OIDC provider) into public tables.
 * Called after `/auth/callback` exchanges the OAuth code so `user.identities` is populated.
 */
export async function POST() {
  const supabase = await createClient()
  const orcidResult = await syncVerifiedOrcidFromSession(supabase)

  if (!orcidResult.ok) {
    return NextResponse.json({ error: orcidResult.error }, { status: orcidResult.status })
  }

  const emailResult = await syncOrcidEmailForUser(supabase)

  if (!emailResult.ok) {
    return NextResponse.json({ error: emailResult.error }, { status: emailResult.status })
  }

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { data: profile } = user
    ? await supabase
        .from('profiles')
        .select('orcid_id, orcid_verified, orcid_email_locked')
        .eq('id', user.id)
        .maybeSingle()
    : { data: null }

  const needsEmailCapture = user
    ? userNeedsOrcidEmailCapture(user, profile)
    : false

  const emailSource =
    emailResult.ok && 'source' in emailResult ? emailResult.source : undefined
  const emailAttempts =
    emailResult.ok && 'attempts' in emailResult ? emailResult.attempts : undefined
  const requiresSessionRefresh =
    emailResult.ok &&
    'requiresSessionRefresh' in emailResult &&
    Boolean(emailResult.requiresSessionRefresh)

  return NextResponse.json({
    linked: orcidResult.linked,
    orcidId: orcidResult.orcidId,
    reason: orcidResult.reason,
    email: emailResult.ok && 'email' in emailResult ? emailResult.email : undefined,
    emailSynced: emailResult.ok && 'synced' in emailResult ? emailResult.synced : false,
    emailSource,
    emailAttempts,
    orcidEmailLocked:
      emailResult.ok && 'locked' in emailResult ? emailResult.locked : profile?.orcid_email_locked,
    needsEmailCapture,
    requiresSessionRefresh,
  })
}
