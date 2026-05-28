import type { SupabaseClient } from '@supabase/supabase-js'
import { createAuditEventWithClient } from '@/lib/supabase/audit'
import { generateHash } from '@/lib/crypto'
import { declineInstitutionInviteForUser } from '@/lib/invites/decline-institution'
import { declineStudyInviteForUser } from '@/lib/invites/decline-study'
import type { ResolvedInvite } from '@/lib/invites/lookup-invite-by-token'

export type DeclineInviteResult =
  | { ok: true }
  | { ok: false; status: number; error: string }

function matchesInvitee(
  resolved: ResolvedInvite,
  userEmail: string | undefined,
  userOrcidIds: string[]
): boolean {
  if (resolved.kind === 'institution' || resolved.kind === 'audit_engagement') {
    const ie = resolved.email?.toLowerCase()
    return Boolean(userEmail && ie && userEmail.toLowerCase() === ie)
  }
  const email = resolved.email?.toLowerCase()
  const em = userEmail?.toLowerCase()
  if (email && em && email === em) return true
  if (resolved.orcidId && userOrcidIds.includes(resolved.orcidId)) return true
  return false
}

export async function declineInviteByTokenForUser(
  admin: SupabaseClient,
  supabase: SupabaseClient,
  userId: string,
  userEmail: string | undefined,
  resolved: ResolvedInvite
): Promise<DeclineInviteResult> {
  const { data: identities } = await supabase
    .from('user_identities')
    .select('provider_id')
    .eq('user_id', userId)
    .eq('provider', 'orcid')
    .is('revoked_at', null)

  const orcids = (identities || []).map((r) => r.provider_id)

  if (!matchesInvitee(resolved, userEmail, orcids)) {
    return {
      ok: false,
      status: 403,
      error: 'This invite is intended for a different account.',
    }
  }

  if (resolved.acceptedAt) {
    return { ok: false, status: 409, error: 'Invite already accepted' }
  }

  if (resolved.revokedAt) {
    return { ok: false, status: 410, error: 'Invite was already declined or revoked' }
  }

  if (new Date(resolved.expiresAt) <= new Date()) {
    return { ok: false, status: 410, error: 'Invite has expired' }
  }

  if (resolved.kind === 'study') {
    return declineStudyInviteForUser(
      supabase,
      admin,
      userId,
      userEmail,
      resolved.studyId,
      resolved.inviteId
    )
  }

  if (resolved.kind === 'institution') {
    return declineInstitutionInviteForUser(
      supabase,
      admin,
      userId,
      userEmail,
      resolved.institutionId,
      resolved.inviteId
    )
  }

  if (resolved.kind !== 'audit_engagement') {
    return { ok: false, status: 500, error: 'Unsupported invite kind' }
  }

  const now = new Date().toISOString()
  const { data: updatedRows, error: upErr } = await admin
    .from('audit_engagements')
    .update({
      revoked_at: now,
      revocation_reason: 'declined_by_invitee',
    })
    .eq('id', resolved.inviteId)
    .is('accepted_at', null)
    .is('revoked_at', null)
    .select('id')

  if (upErr || !updatedRows?.length) {
    return {
      ok: false,
      status: 500,
      error: upErr?.message ?? 'Could not decline invite',
    }
  }

  const stateHash = await generateHash({
    invite_id: resolved.inviteId,
    kind: resolved.kind,
    declined_at: now,
    declined_by: userId,
  })

  await createAuditEventWithClient(
    admin,
    null,
    userId,
    'invite_rejected',
    'audit_engagement',
    resolved.inviteId,
    null,
    stateHash,
    {
      kind: resolved.kind,
      institution_id: resolved.institutionId,
      engagement_id: resolved.inviteId,
    }
  )

  return { ok: true }
}
