import type { SupabaseClient } from '@supabase/supabase-js'
import { createAuditEvent } from '@/lib/supabase/audit'
import { generateHash } from '@/lib/crypto'
import { getStudyCollaborationPolicy } from '@/lib/study-institution-policy'
import {
  STUDY_COLLABORATION_MEMBERS_ONLY_ACCEPT_MESSAGE,
  studyCollaborationBlockedByMembersOnlyPolicy,
} from '@/lib/institution-study-collaboration-policy'
import { getStudyRoleDefinitionIdBySlug } from '@/lib/supabase/study-roles'
import { createAdminClient } from '@/lib/supabase/admin'
import { assertRoomForNewStudyParticipant } from '@/lib/study-participant-room'
import { userHasActiveStudyAssignment } from '@/lib/study-member-role'
import { notifyStudyMemberJoined } from '@/lib/notifications/study-events'

export type AcceptStudyInviteResult =
  | { ok: true }
  | { ok: false; status: number; error: string }

export async function acceptStudyInviteForUser(
  supabase: SupabaseClient,
  userId: string,
  userEmail: string | undefined,
  studyId: string,
  inviteId: string
): Promise<AcceptStudyInviteResult> {
  const { data: invite, error: inviteError } = await supabase
    .from('study_member_invites')
    .select(
      'id, study_id, orcid_id, email, role, invited_by, expires_at, accepted_at, revoked_at'
    )
    .eq('id', inviteId)
    .eq('study_id', studyId)
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
        'You must sign in with the ORCID or email this invite was sent to in order to accept.',
    }
  }

  const policy = await getStudyCollaborationPolicy(studyId)
  if (
    await studyCollaborationBlockedByMembersOnlyPolicy({
      allowExternalCollaborators: policy.allowExternalCollaborators,
      institutionId: policy.institutionId,
      userId,
    })
  ) {
    return {
      ok: false,
      status: 403,
      error: STUDY_COLLABORATION_MEMBERS_ONLY_ACCEPT_MESSAGE,
    }
  }

  const roleSlug = String(invite.role ?? '').trim()
  if (!roleSlug) {
    return { ok: false, status: 500, error: 'Study role is not configured' }
  }

  // Invitees are not study members yet; role definitions and assignment writes use service role after checks above.
  let admin
  try {
    admin = createAdminClient()
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Server configuration error'
    return { ok: false, status: 500, error: msg }
  }

  const defId = await getStudyRoleDefinitionIdBySlug(admin, studyId, roleSlug)
  if (!defId) {
    return { ok: false, status: 500, error: 'Study role is not configured' }
  }

  if (await userHasActiveStudyAssignment(supabase, studyId, userId)) {
    return {
      ok: false,
      status: 409,
      error: 'You are already a member of this study',
    }
  }

  const room = await assertRoomForNewStudyParticipant(supabase, studyId, userId)
  if (!room.ok) {
    return { ok: false, status: 403, error: room.message }
  }

  const { data: existingSame } = await admin
    .from('study_member_role_assignments')
    .select('id')
    .eq('study_id', studyId)
    .eq('user_id', userId)
    .eq('role_definition_id', defId)
    .is('revoked_at', null)
    .maybeSingle()

  if (existingSame) {
    return { ok: false, status: 409, error: 'You are already a member of this study' }
  }

  const { error: insertError } = await admin.from('study_member_role_assignments').insert({
    study_id: studyId,
    user_id: userId,
    role_definition_id: defId,
    granted_by: invite.invited_by,
  })

  if (insertError) {
    if (insertError.code === '23505' || insertError.message.includes('active role')) {
      return { ok: false, status: 409, error: 'You are already a member of this study' }
    }
    return { ok: false, status: 500, error: insertError.message }
  }

  const nowIso = new Date().toISOString()
  const { data: updatedInviteRows, error: updateError } = await admin
    .from('study_member_invites')
    .update({
      accepted_at: nowIso,
      accepted_by: userId,
    })
    .eq('id', invite.id)
    .select('id')

  if (updateError || !updatedInviteRows?.length) {
    return {
      ok: false,
      status: 500,
      error:
        updateError?.message ??
        'Membership was created but the invite could not be marked accepted. Contact a study admin.',
    }
  }

  const stateHash = await generateHash({
    study_id: studyId,
    user_id: userId,
    role: invite.role,
    accepted_by: userId,
  })

  await createAuditEvent(
    studyId,
    userId,
    'study_member_joined',
    'study_member',
    userId,
    null,
    stateHash,
    { role: invite.role, via_invite_id: invite.id }
  )

  const inviteAcceptedHash = await generateHash({
    kind: 'study',
    invite_id: invite.id,
    study_id: studyId,
    user_id: userId,
  })
  await createAuditEvent(
    studyId,
    userId,
    'invite_accepted',
    'study_member_invite',
    invite.id,
    null,
    inviteAcceptedHash,
    { study_id: studyId, role: invite.role }
  )

  try {
    const admin = createAdminClient()
    const { data: studyRow } = await admin
      .from('studies')
      .select('title')
      .eq('id', studyId)
      .single()
    await notifyStudyMemberJoined(
      admin,
      studyId,
      userId,
      (studyRow?.title as string) || 'Study'
    )
  } catch (e) {
    console.error('Failed to create study_member_joined notifications', e)
  }

  return { ok: true }
}
