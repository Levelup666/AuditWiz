import type { SupabaseClient } from '@supabase/supabase-js'
import { createAuditEventWithClient } from '@/lib/supabase/audit'
import { generateHash } from '@/lib/crypto'
import type { DeclineInviteResult } from '@/lib/invites/decline-invite'

export async function declineStudyInviteForUser(
  supabase: SupabaseClient,
  admin: SupabaseClient,
  userId: string,
  userEmail: string | undefined,
  studyId: string,
  inviteId: string
): Promise<DeclineInviteResult> {
  const { data: invite, error: inviteError } = await supabase
    .from('study_member_invites')
    .select('id, study_id, orcid_id, email, role, expires_at, accepted_at, revoked_at')
    .eq('id', inviteId)
    .eq('study_id', studyId)
    .single()

  if (inviteError || !invite) {
    return { ok: false, status: 404, error: 'Invite not found' }
  }

  if (invite.revoked_at) {
    return { ok: false, status: 410, error: 'Invite was already declined or revoked' }
  }

  if (invite.accepted_at) {
    return { ok: false, status: 409, error: 'Invite already accepted' }
  }

  if (new Date(invite.expires_at) <= new Date()) {
    return { ok: false, status: 410, error: 'Invite has expired' }
  }

  const isOrcidMatch =
    invite.orcid_id &&
    (await (async () => {
      const { data: idRow } = await supabase
        .from('user_identities')
        .select('id')
        .eq('user_id', userId)
        .eq('provider', 'orcid')
        .eq('provider_id', invite.orcid_id)
        .is('revoked_at', null)
        .maybeSingle()
      return Boolean(idRow)
    })())

  const emailMatch =
    invite.email &&
    userEmail &&
    userEmail.toLowerCase() === invite.email.toLowerCase()

  if (!isOrcidMatch && !emailMatch) {
    return {
      ok: false,
      status: 403,
      error:
        'You must sign in with the ORCID or email this invite was sent to in order to decline.',
    }
  }

  const now = new Date().toISOString()
  const { data: updatedRows, error: upErr } = await admin
    .from('study_member_invites')
    .update({ revoked_at: now })
    .eq('id', invite.id)
    .eq('study_id', studyId)
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
    invite_id: invite.id,
    kind: 'study',
    declined_at: now,
    declined_by: userId,
  })

  await createAuditEventWithClient(
    admin,
    studyId,
    userId,
    'invite_rejected',
    'study_member_invite',
    invite.id,
    null,
    stateHash,
    { kind: 'study', study_id: studyId, role: invite.role }
  )

  return { ok: true }
}
