import type { SupabaseClient } from '@supabase/supabase-js'
import { createAuditEventWithClient } from '@/lib/supabase/audit'
import { generateHash } from '@/lib/crypto'
import type { DeclineInviteResult } from '@/lib/invites/decline-invite'

export async function declineInstitutionInviteForUser(
  supabase: SupabaseClient,
  admin: SupabaseClient,
  userId: string,
  userEmail: string | undefined,
  institutionId: string,
  inviteId: string
): Promise<DeclineInviteResult> {
  const { data: invite, error: inviteError } = await supabase
    .from('institution_invites')
    .select('id, institution_id, email, role, expires_at, accepted_at, revoked_at')
    .eq('id', inviteId)
    .eq('institution_id', institutionId)
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

  const userEmailNorm = userEmail?.trim().toLowerCase() ?? ''
  const inviteEmailNorm = invite.email?.trim().toLowerCase() ?? ''
  if (!userEmailNorm || userEmailNorm !== inviteEmailNorm) {
    return {
      ok: false,
      status: 403,
      error: 'This invite was sent to a different email address',
    }
  }

  const now = new Date().toISOString()
  const { data: updatedRows, error: upErr } = await admin
    .from('institution_invites')
    .update({ revoked_at: now })
    .eq('id', invite.id)
    .eq('institution_id', institutionId)
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
    kind: 'institution',
    declined_at: now,
    declined_by: userId,
  })

  await createAuditEventWithClient(
    admin,
    null,
    userId,
    'invite_rejected',
    'institution_invite',
    invite.id,
    null,
    stateHash,
    { kind: 'institution', institution_id: institutionId, role: invite.role }
  )

  return { ok: true }
}
