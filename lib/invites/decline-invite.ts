import type { SupabaseClient } from '@supabase/supabase-js'
import { createAuditEventWithClient } from '@/lib/supabase/audit'
import { generateHash } from '@/lib/crypto'
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

  const table =
    resolved.kind === 'study'
      ? 'study_member_invites'
      : resolved.kind === 'institution'
        ? 'institution_invites'
        : 'audit_engagements'
  const targetEntityType =
    resolved.kind === 'study'
      ? 'study_member_invite'
      : resolved.kind === 'institution'
        ? 'institution_invite'
        : 'audit_engagement'
  const now = new Date().toISOString()
  const { error: upErr } = await admin
    .from(table)
    .update({
      revoked_at: now,
      ...(resolved.kind === 'audit_engagement'
        ? { revocation_reason: 'declined_by_invitee' }
        : {}),
    })
    .eq('id', resolved.inviteId)

  if (upErr) {
    return { ok: false, status: 500, error: upErr.message }
  }

  const studyId = resolved.kind === 'study' ? resolved.studyId : null
  const stateHash = await generateHash({
    invite_id: resolved.inviteId,
    kind: resolved.kind,
    declined_at: now,
    declined_by: userId,
  })

  const metadata: Record<string, unknown> = { kind: resolved.kind }
  if (resolved.kind === 'study') {
    metadata.study_id = resolved.studyId
  } else if (resolved.kind === 'institution') {
    metadata.institution_id = resolved.institutionId
  } else {
    metadata.institution_id = resolved.institutionId
    metadata.engagement_id = resolved.inviteId
  }

  await createAuditEventWithClient(
    admin,
    studyId,
    userId,
    'invite_rejected',
    targetEntityType,
    resolved.inviteId,
    null,
    stateHash,
    metadata
  )

  return { ok: true }
}
