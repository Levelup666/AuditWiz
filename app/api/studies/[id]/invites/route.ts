import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { canManageStudyMembers, isActiveInstitutionMember } from '@/lib/supabase/permissions'
import { getStudyCollaborationPolicy } from '@/lib/study-institution-policy'
import { createAuditEvent } from '@/lib/supabase/audit'
import { generateHash } from '@/lib/crypto'

const VALID_ROLES = ['creator', 'reviewer', 'approver', 'auditor', 'admin'] as const

function permissionFlagsForRole(role: string) {
  return {
    can_view: true,
    can_comment: true,
    can_review: ['reviewer', 'approver', 'auditor', 'admin'].includes(role),
    can_approve: ['approver', 'admin'].includes(role),
    can_share: ['approver', 'admin'].includes(role),
  }
}

/** GET: list pending invites for the study (admins only) */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: studyId } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const allowed = await canManageStudyMembers(user.id, studyId)
  if (!allowed) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { data: invites, error } = await supabase
    .from('study_member_invites')
    .select('id, orcid_id, email, role, invited_at, expires_at')
    .eq('study_id', studyId)
    .is('accepted_at', null)
    .gt('expires_at', new Date().toISOString())
    .order('invited_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(invites ?? [])
}

/** POST: accept a pending invite (caller must have matching ORCID or email) */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: studyId } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => ({}))
  const { invite_id: inviteId } = body as { invite_id?: string }

  if (!inviteId) {
    return NextResponse.json({ error: 'invite_id is required' }, { status: 400 })
  }

  const { data: invite, error: inviteError } = await supabase
    .from('study_member_invites')
    .select('id, study_id, orcid_id, email, role, invited_by, expires_at, accepted_at')
    .eq('id', inviteId)
    .eq('study_id', studyId)
    .single()

  if (inviteError || !invite) {
    return NextResponse.json({ error: 'Invite not found' }, { status: 404 })
  }

  if (invite.accepted_at) {
    return NextResponse.json({ error: 'Invite already accepted' }, { status: 409 })
  }

  if (new Date(invite.expires_at) <= new Date()) {
    return NextResponse.json({ error: 'Invite has expired' }, { status: 410 })
  }

  const isOrcidMatch =
    invite.orcid_id &&
    (await (async () => {
      const { data: idRow } = await supabase
        .from('user_identities')
        .select('id')
        .eq('user_id', user.id)
        .eq('provider', 'orcid')
        .eq('provider_id', invite.orcid_id)
        .is('revoked_at', null)
        .maybeSingle()
      return Boolean(idRow)
    })());

  const { data: authUser } = await supabase.auth.getUser()
  const emailMatch =
    invite.email &&
    authUser?.user?.email &&
    authUser.user.email.toLowerCase() === invite.email.toLowerCase()

  if (!isOrcidMatch && !emailMatch) {
    return NextResponse.json(
      {
        error:
          'You must sign in with the ORCID or email this invite was sent to in order to accept.',
      },
      { status: 403 }
    )
  }

  const policy = await getStudyCollaborationPolicy(studyId)
  if (
    policy.institutionId &&
    !policy.allowExternalCollaborators &&
    !(await isActiveInstitutionMember(user.id, policy.institutionId))
  ) {
    return NextResponse.json(
      {
        error:
          "This study's institution only allows institution members on studies. Ask an admin to invite you to the institution and accept that invite first, then return here to accept the study invite.",
      },
      { status: 403 }
    )
  }

  const flags = permissionFlagsForRole(invite.role)

  const { error: insertError } = await supabase.from('study_members').insert({
    study_id: studyId,
    user_id: user.id,
    role: invite.role,
    granted_by: invite.invited_by,
    ...flags,
  })

  if (insertError) {
    if (insertError.code === '23505') {
      return NextResponse.json(
        { error: 'You are already a member of this study' },
        { status: 409 }
      )
    }
    return NextResponse.json({ error: insertError.message }, { status: 500 })
  }

  const { error: updateError } = await supabase
    .from('study_member_invites')
    .update({
      accepted_at: new Date().toISOString(),
      accepted_by: user.id,
    })
    .eq('id', invite.id)

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  const stateHash = await generateHash({
    study_id: studyId,
    user_id: user.id,
    role: invite.role,
    accepted_by: user.id,
  })
  await createAuditEvent(
    studyId,
    user.id,
    'study_member_joined',
    'study_member',
    user.id,
    null,
    stateHash,
    { role: invite.role, via_invite_id: invite.id }
  )

  return NextResponse.json({ success: true })
}
