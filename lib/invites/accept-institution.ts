import type { SupabaseClient } from '@supabase/supabase-js'
import { createAuditEvent } from '@/lib/supabase/audit'
import { generateHash } from '@/lib/crypto'

export type AcceptInstitutionInviteResult =
  | { ok: true }
  | { ok: false; status: number; error: string }

export async function acceptInstitutionInviteForUser(
  supabase: SupabaseClient,
  userId: string,
  userEmail: string | undefined,
  institutionId: string,
  inviteId: string
): Promise<AcceptInstitutionInviteResult> {
  const { data: invite, error: inviteError } = await supabase
    .from('institution_invites')
    .select('id, institution_id, email, role, invited_by, expires_at, accepted_at, revoked_at')
    .eq('id', inviteId)
    .eq('institution_id', institutionId)
    .single()

  if (inviteError || !invite) {
    return { ok: false, status: 404, error: 'Invite not found' }
  }

  if (invite.revoked_at) {
    return { ok: false, status: 410, error: 'This invite was revoked' }
  }

  if (invite.accepted_at) {
    return { ok: false, status: 409, error: 'Invite already accepted' }
  }

  if (new Date(invite.expires_at) <= new Date()) {
    return { ok: false, status: 410, error: 'Invite has expired' }
  }

  const userEmailNorm = userEmail?.toLowerCase()
  const inviteEmailNorm = invite.email?.toLowerCase()
  if (userEmailNorm !== inviteEmailNorm) {
    return {
      ok: false,
      status: 403,
      error: 'This invite was sent to a different email address',
    }
  }

  const { error: updateError } = await supabase
    .from('institution_invites')
    .update({
      accepted_at: new Date().toISOString(),
      accepted_by: userId,
    })
    .eq('id', inviteId)

  if (updateError) {
    return { ok: false, status: 500, error: updateError.message }
  }

  const { error: memberError } = await supabase.from('institution_members').insert({
    institution_id: institutionId,
    user_id: userId,
    role: invite.role,
    granted_by: invite.invited_by,
  })

  if (memberError) {
    return { ok: false, status: 500, error: memberError.message }
  }

  const stateHash = await generateHash({
    user_id: userId,
    institution_id: institutionId,
    role: invite.role,
  })

  await createAuditEvent(
    null,
    userId,
    'institution_member_joined',
    'institution',
    institutionId,
    null,
    stateHash,
    {
      institution_id: institutionId,
      invite_id: inviteId,
      role: invite.role,
    }
  )

  const inviteAcceptedHash = await generateHash({
    kind: 'institution',
    invite_id: invite.id,
    institution_id: institutionId,
    user_id: userId,
  })
  await createAuditEvent(
    null,
    userId,
    'invite_accepted',
    'institution_invite',
    invite.id,
    null,
    inviteAcceptedHash,
    { institution_id: institutionId, role: invite.role }
  )

  return { ok: true }
}
