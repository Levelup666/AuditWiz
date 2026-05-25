import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  normalizeContactEmail,
  userHasUsableAuthEmail,
} from '@/lib/auth/orcid-email'
import {
  resolveOrcidContactEmail,
  type EmailResolveAttempt,
  type OrcidEmailSource,
} from '@/lib/auth/orcid-email-resolve'
import { findOrcidAuthIdentity, isOrcidPrimaryAccount } from '@/lib/auth/is-orcid-auth'
import { extractOrcidFromSupabaseIdentity } from '@/lib/auth/orcid-id'
import { validateOrcidContactEmail } from '@/lib/auth/validate-orcid-email'
import { syncVerifiedOrcidFromSession } from '@/lib/auth/sync-verified-orcid'
import { createAuditEvent } from '@/lib/supabase/audit'
import { generateHash } from '@/lib/crypto'

export type SyncOrcidEmailResult =
  | {
      ok: true
      email: string
      synced: boolean
      source: OrcidEmailSource
      locked: boolean
      requiresSessionRefresh?: boolean
      attempts?: EmailResolveAttempt[]
    }
  | {
      ok: true
      synced: false
      reason: 'not_orcid_user' | 'noop' | 'no_email_found'
      attempts?: EmailResolveAttempt[]
    }
  | { ok: false; error: string; status: number }

async function getProviderAccessToken(
  supabase: SupabaseClient
): Promise<string | null> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.provider_token
  return typeof token === 'string' && token.trim() ? token.trim() : null
}

/**
 * Sets auth.users.email from ORCID for ORCID-primary accounts and locks it on the profile.
 */
export async function syncOrcidEmailForUser(
  supabase: SupabaseClient
): Promise<SyncOrcidEmailResult> {
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser()

  if (userErr || !user) {
    return { ok: false, error: 'Unauthorized', status: 401 }
  }

  const orcidIdentity = findOrcidAuthIdentity(user)
  if (!orcidIdentity) {
    return { ok: true, synced: false, reason: 'not_orcid_user' }
  }

  const orcidId = extractOrcidFromSupabaseIdentity({
    identity_id: orcidIdentity.identity_id,
    identity_data: (orcidIdentity.identity_data ?? null) as Record<string, unknown> | null,
  })
  if (!orcidId) {
    return { ok: false, error: 'Could not read ORCID iD for email sync', status: 422 }
  }

  const { data: profile, error: profileErr } = await supabase
    .from('profiles')
    .select('orcid_id, orcid_verified, orcid_email_locked')
    .eq('id', user.id)
    .maybeSingle()

  if (profileErr) {
    return { ok: false, error: profileErr.message, status: 500 }
  }

  const orcidPrimary = isOrcidPrimaryAccount(user, profile)
  if (!orcidPrimary && !profile?.orcid_verified) {
    return { ok: true, synced: false, reason: 'not_orcid_user' }
  }

  if (profile?.orcid_email_locked && userHasUsableAuthEmail(user.email)) {
    return {
      ok: true,
      email: normalizeContactEmail(user.email!)!,
      synced: false,
      source: 'existing',
      locked: true,
    }
  }

  const providerAccessToken = await getProviderAccessToken(supabase)
  const resolved = await resolveOrcidContactEmail({
    orcidId,
    identityData: orcidIdentity.identity_data as Record<string, unknown> | null,
    existingAuthEmail: user.email,
    providerAccessToken,
  })

  if (!resolved.email) {
    return {
      ok: true,
      synced: false,
      reason: 'no_email_found',
      attempts: resolved.attempts,
    }
  }

  const currentNorm = userHasUsableAuthEmail(user.email)
    ? normalizeContactEmail(user.email!)
    : null

  if (profile?.orcid_email_locked && currentNorm && currentNorm !== resolved.email) {
    return {
      ok: false,
      error: 'Account email is locked to your ORCID email and cannot be changed.',
      status: 409,
    }
  }

  if (currentNorm === resolved.email && profile?.orcid_email_locked) {
    return {
      ok: true,
      email: resolved.email,
      synced: false,
      source: resolved.source ?? 'existing',
      locked: true,
      attempts: resolved.attempts,
    }
  }

  if (orcidPrimary || !currentNorm) {
    const admin = createAdminClient()
    const { error: updateErr } = await admin.auth.admin.updateUserById(user.id, {
      email: resolved.email,
      email_confirm: true,
    })
    if (updateErr) {
      if (updateErr.message.toLowerCase().includes('already')) {
        return {
          ok: false,
          error:
            'This ORCID email is already registered to another account. Sign in with that email or contact support.',
          status: 409,
        }
      }
      return { ok: false, error: updateErr.message, status: 500 }
    }

    const lockEmail = orcidPrimary
    const { error: profErr } = await supabase.from('profiles').upsert(
      {
        id: user.id,
        orcid_email_locked: lockEmail,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'id' }
    )
    if (profErr) {
      return { ok: false, error: profErr.message, status: 500 }
    }

    const stateHash = await generateHash({
      user_id: user.id,
      orcid_id: orcidId,
      email_set: true,
      source: resolved.source,
    })
    await createAuditEvent(
      null,
      user.id,
      'identity_linked',
      'user_identity',
      user.id,
      null,
      stateHash,
      {
        orcid_id: orcidId,
        source: 'orcid_email_sync',
        email_source: resolved.source,
        orcid_email_locked: lockEmail,
      }
    )

    return {
      ok: true,
      email: resolved.email,
      synced: true,
      source: resolved.source ?? 'identity',
      locked: lockEmail,
      requiresSessionRefresh: true,
      attempts: resolved.attempts,
    }
  }

  return { ok: true, synced: false, reason: 'noop', attempts: resolved.attempts }
}

/** Lock ORCID email after one-time manual capture (ORCID record match or attested manual entry). */
export async function setOrcidLockedEmailForUser(
  supabase: SupabaseClient,
  emailRaw: string,
  options?: { attested?: boolean }
): Promise<{ ok: true; requiresSessionRefresh?: boolean } | { ok: false; error: string }> {
  const email = normalizeContactEmail(emailRaw)
  if (!email) {
    return { ok: false, error: 'Enter a valid email address.' }
  }

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Not signed in' }

  const orcidIdentity = findOrcidAuthIdentity(user)
  const orcidId = orcidIdentity
    ? extractOrcidFromSupabaseIdentity({
        identity_id: orcidIdentity.identity_id,
        identity_data: (orcidIdentity.identity_data ?? null) as Record<string, unknown> | null,
      })
    : null

  let { data: profile } = await supabase
    .from('profiles')
    .select('orcid_id, orcid_verified, orcid_email_locked')
    .eq('id', user.id)
    .maybeSingle()

  if ((!profile?.orcid_verified || !profile?.orcid_id) && orcidIdentity && orcidId) {
    const syncResult = await syncVerifiedOrcidFromSession(supabase)
    if (!syncResult.ok) {
      return { ok: false, error: syncResult.error }
    }
    const refetch = await supabase
      .from('profiles')
      .select('orcid_id, orcid_verified, orcid_email_locked')
      .eq('id', user.id)
      .maybeSingle()
    profile = refetch.data
  }

  if (!profile?.orcid_verified || !profile.orcid_id) {
    if (!orcidIdentity || !orcidId) {
      return { ok: false, error: 'Link and verify your ORCID before setting a contact email.' }
    }
    return {
      ok: false,
      error:
        'Could not link your ORCID to your profile. Sign out, sign in again with ORCID, then retry.',
    }
  }

  if (!isOrcidPrimaryAccount(user, profile)) {
    return { ok: false, error: 'Email can only be locked for ORCID sign-in accounts.' }
  }

  if (
    profile.orcid_email_locked &&
    userHasUsableAuthEmail(user.email) &&
    normalizeContactEmail(user.email!) === email
  ) {
    return { ok: true }
  }

  if (profile.orcid_email_locked && userHasUsableAuthEmail(user.email)) {
    return {
      ok: false,
      error: 'Your contact email is locked to your ORCID email and cannot be changed.',
    }
  }

  const effectiveOrcidId = orcidId ?? profile.orcid_id
  if (effectiveOrcidId) {
    const providerAccessToken = await getProviderAccessToken(supabase)
    const validation = await validateOrcidContactEmail({
      orcidId: effectiveOrcidId,
      emailRaw,
      identityData: orcidIdentity?.identity_data as Record<string, unknown> | null,
      providerAccessToken,
      attested: options?.attested,
    })
    if (!validation.ok) {
      return { ok: false, error: validation.error }
    }

    if (validation.mode === 'attested') {
      const stateHash = await generateHash({
        user_id: user.id,
        orcid_id: effectiveOrcidId,
        email_attested: true,
      })
      await createAuditEvent(
        null,
        user.id,
        'identity_linked',
        'user_identity',
        user.id,
        null,
        stateHash,
        {
          orcid_id: effectiveOrcidId,
          source: 'orcid_email_attested',
          email_validation_mode: 'attested',
        }
      )
    }
  }

  const admin = createAdminClient()
  const { error: updateErr } = await admin.auth.admin.updateUserById(user.id, {
    email,
    email_confirm: true,
  })
  if (updateErr) {
    return { ok: false, error: updateErr.message }
  }

  const { error: profErr } = await supabase
    .from('profiles')
    .update({ orcid_email_locked: true, updated_at: new Date().toISOString() })
    .eq('id', user.id)

  if (profErr) return { ok: false, error: profErr.message }

  return { ok: true, requiresSessionRefresh: true }
}
