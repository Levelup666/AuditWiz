import type { SupabaseClient } from '@supabase/supabase-js'
import { getOrcidOAuthProviderId } from '@/lib/auth/orcid-provider'
import { extractOrcidFromSupabaseIdentity, normalizeOrcidId } from '@/lib/auth/orcid-id'
import { upsertProfileLegalNames } from '@/lib/profile/upsert-legal-names'
import { createAuditEvent } from '@/lib/supabase/audit'
import { generateHash } from '@/lib/crypto'

export type SyncVerifiedOrcidResult =
  | { ok: true; linked: boolean; orcidId?: string; reason?: 'no_orcid_identity' | 'noop' }
  | { ok: false; error: string; status: number }

/**
 * After Supabase Auth completes ORCID OIDC (sign-in or linkIdentity), copy the verified
 * ORCID into `public.user_identities` + `public.profiles` and emit `identity_linked` once.
 */
export async function syncVerifiedOrcidFromSession(
  supabase: SupabaseClient
): Promise<SyncVerifiedOrcidResult> {
  const providerId = getOrcidOAuthProviderId()

  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser()

  if (userErr || !user) {
    return { ok: false, error: 'Unauthorized', status: 401 }
  }

  const orcidIdentity = user.identities?.find((i) => i.provider === providerId)
  if (!orcidIdentity) {
    return { ok: true, linked: false, reason: 'no_orcid_identity' }
  }

  const orcidId = extractOrcidFromSupabaseIdentity({
    identity_id: orcidIdentity.identity_id,
    identity_data: (orcidIdentity.identity_data ?? null) as Record<string, unknown> | null,
  })
  if (!orcidId) {
    return { ok: false, error: 'Could not read ORCID from sign-in response', status: 422 }
  }

  const { data: profile, error: profileErr } = await supabase
    .from('profiles')
    .select('orcid_id, orcid_verified, first_name, last_name')
    .eq('id', user.id)
    .maybeSingle()

  if (profileErr) {
    return { ok: false, error: profileErr.message, status: 500 }
  }

  if (profile?.orcid_id) {
    const existingNorm = normalizeOrcidId(profile.orcid_id)
    if (existingNorm && existingNorm !== orcidId) {
      return {
        ok: false,
        error:
          'This account already has a different ORCID. Contact support if you need to change it.',
        status: 409,
      }
    }
  }

  const { data: takenByOther } = await supabase
    .from('user_identities')
    .select('user_id')
    .eq('provider', 'orcid')
    .eq('provider_id', orcidId)
    .is('revoked_at', null)
    .maybeSingle()

  if (takenByOther && takenByOther.user_id !== user.id) {
    return {
      ok: false,
      error: 'This ORCID is already linked to another account.',
      status: 409,
    }
  }

  const { data: ownRow } = await supabase
    .from('user_identities')
    .select('id, provider_id, verified')
    .eq('user_id', user.id)
    .eq('provider', 'orcid')
    .is('revoked_at', null)
    .maybeSingle()

  if (ownRow && ownRow.provider_id !== orcidId) {
    return {
      ok: false,
      error:
        'This account already has a different ORCID identity. Remove it in ORCID before linking again.',
      status: 409,
    }
  }

  const alreadyComplete =
    Boolean(ownRow?.verified) && Boolean(profile?.orcid_id) && Boolean(profile?.orcid_verified)
  if (alreadyComplete && ownRow?.provider_id === orcidId) {
    return { ok: true, linked: false, orcidId, reason: 'noop' }
  }

  let insertedIdentity = false
  if (!ownRow) {
    const { error: insErr } = await supabase.from('user_identities').insert({
      user_id: user.id,
      provider: 'orcid',
      provider_id: orcidId,
      verified: true,
      linked_at: new Date().toISOString(),
    })
    if (insErr) {
      if (insErr.code === '23505') {
        return {
          ok: false,
          error: 'This ORCID is already linked to another account.',
          status: 409,
        }
      }
      return { ok: false, error: insErr.message, status: 500 }
    }
    insertedIdentity = true
  } else if (!ownRow.verified) {
    const { error: upErr } = await supabase
      .from('user_identities')
      .update({ verified: true })
      .eq('id', ownRow.id)
    if (upErr) {
      return { ok: false, error: upErr.message, status: 500 }
    }
  }

  const { error: upsertErr } = await supabase.from('profiles').upsert(
    {
      id: user.id,
      orcid_id: orcidId,
      orcid_verified: true,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'id' }
  )

  if (upsertErr) {
    return { ok: false, error: upsertErr.message, status: 500 }
  }

  const idData = orcidIdentity.identity_data as Record<string, unknown> | undefined
  const given = typeof idData?.given_name === 'string' ? idData.given_name.trim() : ''
  const family = typeof idData?.family_name === 'string' ? idData.family_name.trim() : ''

  const needsNames = !profile?.first_name?.trim() || !profile?.last_name?.trim()

  if (needsNames && given && family) {
    const nameRes = await upsertProfileLegalNames(supabase, user.id, given, family)
    if (nameRes.error) {
      // ORCID is linked; names are optional — do not fail the whole sync
      console.warn('syncVerifiedOrcidFromSession: name upsert skipped:', nameRes.error)
    }
  }

  const shouldAudit = insertedIdentity || !profile?.orcid_verified

  if (shouldAudit) {
    const stateHash = await generateHash({
      provider: 'orcid',
      provider_id: orcidId,
      user_id: user.id,
      verified: true,
      source: 'oauth',
    })
    await createAuditEvent(
      null,
      user.id,
      'identity_linked',
      'user_identity',
      user.id,
      null,
      stateHash,
      { orcid_id: orcidId, verified: true, source: 'orcid_oauth' }
    )
  }

  return { ok: true, linked: true, orcidId }
}
