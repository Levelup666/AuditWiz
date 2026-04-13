import type { SupabaseClient } from '@supabase/supabase-js'
import { createAuditEvent } from '@/lib/supabase/audit'
import { generateHash } from '@/lib/crypto'
import { isActiveInstitutionMember } from '@/lib/supabase/permissions'
import { getStudyCollaborationPolicy } from '@/lib/study-institution-policy'
import { getStudyRoleDefinitionIdBySlug } from '@/lib/supabase/study-roles'
import {
  activeStudyAssignmentCount,
  assertRoomForNewStudyParticipant,
} from '@/lib/study-participant-room'

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
    policy.institutionId &&
    !policy.allowExternalCollaborators &&
    !(await isActiveInstitutionMember(userId, policy.institutionId))
  ) {
    return {
      ok: false,
      status: 403,
      error:
        "This study's institution only allows institution members on studies. Ask an admin to invite you to the institution and accept that invite first, then return here to accept the study invite.",
    }
  }

  const roleSlug = String(invite.role ?? '').trim()
  const defId = await getStudyRoleDefinitionIdBySlug(supabase, studyId, roleSlug)
  if (!defId) {
    return { ok: false, status: 500, error: 'Study role is not configured' }
  }

  let existingSlots: number
  try {
    existingSlots = await activeStudyAssignmentCount(supabase, studyId, userId)
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Assignment check failed'
    return { ok: false, status: 500, error: msg }
  }

  if (existingSlots >= 2) {
    return {
      ok: false,
      status: 409,
      error: 'You already have the maximum number of roles on this study',
    }
  }

  if (existingSlots === 0) {
    const room = await assertRoomForNewStudyParticipant(supabase, studyId, userId)
    if (!room.ok) {
      return { ok: false, status: 403, error: room.message }
    }
  }

  const { data: existingSame } = await supabase
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

  const { error: insertError } = await supabase
    .from('study_member_role_assignments')
    .insert({
      study_id: studyId,
      user_id: userId,
      role_definition_id: defId,
      granted_by: invite.invited_by,
    })

  if (insertError) {
    if (insertError.code === '23505' || insertError.message.includes('At most two')) {
      return { ok: false, status: 409, error: 'You are already a member of this study' }
    }
    return { ok: false, status: 500, error: insertError.message }
  }

  const { error: updateError } = await supabase
    .from('study_member_invites')
    .update({
      accepted_at: new Date().toISOString(),
      accepted_by: userId,
    })
    .eq('id', invite.id)

  if (updateError) {
    return { ok: false, status: 500, error: updateError.message }
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

  return { ok: true }
}
