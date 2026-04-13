import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { canManageStudyMembers, isActiveInstitutionMember } from '@/lib/supabase/permissions'
import { getStudyCollaborationPolicy } from '@/lib/study-institution-policy'
import {
  inviteEmailDispatchFields,
  sendExistingUserPendingInviteNotification,
  sendPendingInviteEmail,
} from '@/lib/email/pending-invite-notification'
import { findUserIdByEmail } from '@/lib/supabase/find-user-by-email'
import { createAuditEvent } from '@/lib/supabase/audit'
import { generateHash } from '@/lib/crypto'
import { validateStudyMemberRevocation } from '@/lib/supabase/member-revocation'
import { assertStudyIsActive } from '@/lib/supabase/study-status'
import { generateInviteToken } from '@/lib/invites/token'
import { getPendingInviteExpiresAt } from '@/lib/invites/pending-invite-expiry'
import { revokeExpiredPendingStudyEmailInvite } from '@/lib/invites/revoke-expired-pending-study-invite'
import { formatMemberListName } from '@/lib/profile/member-display-name'
import { getStudyRoleDefinitionIdBySlug } from '@/lib/supabase/study-roles'
import { getEffectiveStudyMemberCap } from '@/lib/study-member-cap'
import {
  activeStudyAssignmentCount,
  assertRoomForNewStudyParticipant,
} from '@/lib/study-participant-room'

async function createPendingStudyInviteByEmail(params: {
  supabase: Awaited<ReturnType<typeof createClient>>
  studyId: string
  invitedBy: string
  emailTrim: string
  role: string
  auditExtra: Record<string, unknown>
}): Promise<{ inviteId: string; rawToken: string; expiresAt: string }> {
  const { supabase, studyId, invitedBy, emailTrim, role, auditExtra } = params
  await revokeExpiredPendingStudyEmailInvite(supabase, studyId, emailTrim)
  const expiresAt = getPendingInviteExpiresAt()
  const { rawToken, tokenHash } = generateInviteToken()
  const { data: invite, error: inviteError } = await supabase
    .from('study_member_invites')
    .insert({
      study_id: studyId,
      email: emailTrim,
      role,
      invited_by: invitedBy,
      expires_at: expiresAt.toISOString(),
      token_hash: tokenHash,
    })
    .select('id')
    .single()

  if (inviteError) {
    throw inviteError
  }

  const stateHash = await generateHash({
    study_id: studyId,
    invite_id: invite.id,
    email: emailTrim,
    role,
  })
  await createAuditEvent(
    studyId,
    invitedBy,
    'study_member_invited',
    'study_member_invite',
    invite.id,
    null,
    stateHash,
    { role, email: emailTrim, pending: true, ...auditExtra }
  )
  const createdHash = await generateHash({
    study_id: studyId,
    invite_id: invite.id,
    action: 'invite_created',
  })
  await createAuditEvent(
    studyId,
    invitedBy,
    'invite_created',
    'study_member_invite',
    invite.id,
    null,
    createdHash,
    { role, email: emailTrim, pending: true, kind: 'study', ...auditExtra }
  )

  return { inviteId: invite.id, rawToken, expiresAt: expiresAt.toISOString() }
}

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

  const { data: members, error } = await supabase
    .from('study_members')
    .select(
      'id, user_id, role, role_definition_id, granted_at, granted_by, can_view, can_comment, can_review, can_approve, can_share'
    )
    .eq('study_id', studyId)
    .is('revoked_at', null)
    .order('granted_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const admin = createAdminClient()
  const emails: Record<string, string> = {}
  for (const m of members || []) {
    try {
      const { data: u } = await admin.auth.admin.getUserById(m.user_id)
      if (u?.user?.email) emails[m.user_id] = u.user.email
    } catch {
      emails[m.user_id] = m.user_id.slice(0, 8) + '…'
    }
  }

  const userIds = [...new Set((members ?? []).map((m) => m.user_id))]
  const { data: profileRows } =
    userIds.length > 0
      ? await supabase
          .from('profiles')
          .select('id, orcid_id, first_name, last_name, nickname, display_name')
          .in('id', userIds)
      : { data: null as null }

  const profileByUser = new Map(
    (profileRows ?? []).map((p) => [
      p.id,
      p,
    ])
  )

  const withEmails = (members || []).map((m) => {
    const email = emails[m.user_id] ?? m.user_id.slice(0, 8) + '…'
    const prof = profileByUser.get(m.user_id)
    const member_display_name = formatMemberListName(
      {
        nickname: prof?.nickname,
        first_name: prof?.first_name,
        last_name: prof?.last_name,
        display_name: prof?.display_name,
      },
      { email, userId: m.user_id }
    )
    return {
      ...m,
      email,
      orcid_id: prof?.orcid_id ?? null,
      member_display_name,
    }
  })

  const { data: studyCapRow } = await supabase
    .from('studies')
    .select('max_members')
    .eq('id', studyId)
    .single()
  const effCap = getEffectiveStudyMemberCap(studyCapRow ?? { max_members: null })
  const distinctUsers = new Set((withEmails ?? []).map((m) => m.user_id)).size

  return NextResponse.json({
    members: withEmails,
    meta: {
      member_cap: effCap,
      distinct_member_count: distinctUsers,
    },
  })
}

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

  const allowed = await canManageStudyMembers(user.id, studyId)
  if (!allowed) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const activeCheck = await assertStudyIsActive(supabase, studyId)
  if (!activeCheck.ok) {
    return NextResponse.json({ error: activeCheck.error }, { status: 403 })
  }

  const body = await request.json().catch(() => ({}))
  const { email, orcid_id: orcidIdRaw, role, user_id: userIdRaw } = body as {
    email?: string
    orcid_id?: string
    role?: string
    user_id?: string
  }

  const emailTrim = email?.trim()
  const orcidId =
    orcidIdRaw != null && String(orcidIdRaw).trim() !== ''
      ? String(orcidIdRaw).trim().replace(/-/g, '').replace(/(\d{4})(\d{4})(\d{4})(\d{3}[\dX])/i, '$1-$2-$3-$4')
      : null

  const userIdTrim =
    typeof userIdRaw === 'string' && userIdRaw.trim() !== '' ? userIdRaw.trim() : null

  if (!role) {
    return NextResponse.json({ error: 'role is required' }, { status: 400 })
  }

  const roleDefId = await getStudyRoleDefinitionIdBySlug(supabase, studyId, String(role).trim())
  if (!roleDefId) {
    return NextResponse.json({ error: 'Invalid role' }, { status: 400 })
  }

  if (!userIdTrim && !emailTrim && !orcidId) {
    return NextResponse.json(
      { error: 'Provide an institution member, an email, or an ORCID ID' },
      { status: 400 }
    )
  }

  const policy = await getStudyCollaborationPolicy(studyId)
  const institutionOnlyMessage =
    'This institution requires everyone on a study to be an institution member first. Invite them to the institution (and wait for acceptance), or enable external collaborators in institution settings.'

  // Add existing institution member by user id (internal picker)
  if (userIdTrim) {
    const uuidRe =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    if (!uuidRe.test(userIdTrim)) {
      return NextResponse.json({ error: 'Invalid user id' }, { status: 400 })
    }

    if (!policy.institutionId) {
      return NextResponse.json(
        {
          error:
            'Adding a member by selection requires this study to belong to an institution.',
        },
        { status: 400 }
      )
    }

    const isInstitutionMember = await isActiveInstitutionMember(
      userIdTrim,
      policy.institutionId
    )
    if (!isInstitutionMember) {
      return NextResponse.json(
        {
          error:
            'Selected person is not an active member of this institution. Choose someone from the institution list, or invite them to the institution first.',
        },
        { status: 400 }
      )
    }

    const ac = await activeStudyAssignmentCount(supabase, studyId, userIdTrim)
    if (ac >= 2) {
      return NextResponse.json(
        { error: 'User already has the maximum number of roles on this study' },
        { status: 409 }
      )
    }
    const { data: dupRole } = await supabase
      .from('study_member_role_assignments')
      .select('id')
      .eq('study_id', studyId)
      .eq('user_id', userIdTrim)
      .eq('role_definition_id', roleDefId)
      .is('revoked_at', null)
      .maybeSingle()
    if (dupRole) {
      return NextResponse.json(
        { error: 'User already has this role on the study' },
        { status: 409 }
      )
    }

    const room = await assertRoomForNewStudyParticipant(supabase, studyId, userIdTrim)
    if (!room.ok) {
      return NextResponse.json({ error: room.message }, { status: 403 })
    }

    const { error: insertByIdError } = await supabase
      .from('study_member_role_assignments')
      .insert({
        study_id: studyId,
        user_id: userIdTrim,
        role_definition_id: roleDefId,
        granted_by: user.id,
      })

    if (insertByIdError) {
      if (
        insertByIdError.code === '23505' ||
        insertByIdError.message.includes('At most two')
      ) {
        return NextResponse.json(
          { error: 'User is already a member of this study' },
          { status: 409 }
        )
      }
      return NextResponse.json({ error: insertByIdError.message }, { status: 500 })
    }

    const stateHash = await generateHash({
      study_id: studyId,
      user_id: userIdTrim,
      role,
      granted_by: user.id,
    })
    await createAuditEvent(
      studyId,
      user.id,
      'study_member_invited',
      'study_member',
      userIdTrim,
      null,
      stateHash,
      { role, user_id: userIdTrim, source: 'institution_member_picker' }
    )

    const admin = createAdminClient()
    let notifyEmail: string | null = null
    try {
      const { data: u } = await admin.auth.admin.getUserById(userIdTrim)
      notifyEmail = u?.user?.email ?? null
    } catch {
      notifyEmail = null
    }
    let emailDispatch: ReturnType<typeof inviteEmailDispatchFields> | null = null
    if (notifyEmail) {
      const emailResult = await sendPendingInviteEmail({
        to: notifyEmail,
        kind: 'study',
        contextLabel: policy.studyTitle,
        supabaseAdmin: admin,
      })
      emailDispatch = inviteEmailDispatchFields(emailResult)
    }

    return NextResponse.json({
      success: true,
      message:
        'Member added. They can also see this study from Invites if they prefer the in-app flow.',
      ...(emailDispatch ?? {}),
    })
  }

  // Invite by ORCID: resolve user from user_identities
  if (orcidId) {
    const { data: identity } = await supabase
      .from('user_identities')
      .select('user_id')
      .eq('provider', 'orcid')
      .eq('provider_id', orcidId)
      .is('revoked_at', null)
      .maybeSingle()

    if (identity) {
      if (
        policy.institutionId &&
        !policy.allowExternalCollaborators &&
        !(await isActiveInstitutionMember(identity.user_id, policy.institutionId))
      ) {
        return NextResponse.json({ error: institutionOnlyMessage }, { status: 403 })
      }

      const acO = await activeStudyAssignmentCount(supabase, studyId, identity.user_id)
      if (acO >= 2) {
        return NextResponse.json(
          { error: 'User already has the maximum number of roles on this study' },
          { status: 409 }
        )
      }
      const { data: dupO } = await supabase
        .from('study_member_role_assignments')
        .select('id')
        .eq('study_id', studyId)
        .eq('user_id', identity.user_id)
        .eq('role_definition_id', roleDefId)
        .is('revoked_at', null)
        .maybeSingle()
      if (dupO) {
        return NextResponse.json(
          { error: 'User already has this role on the study' },
          { status: 409 }
        )
      }
      const roomO = await assertRoomForNewStudyParticipant(
        supabase,
        studyId,
        identity.user_id
      )
      if (!roomO.ok) {
        return NextResponse.json({ error: roomO.message }, { status: 403 })
      }

      const { error: insertError } = await supabase
        .from('study_member_role_assignments')
        .insert({
          study_id: studyId,
          user_id: identity.user_id,
          role_definition_id: roleDefId,
          granted_by: user.id,
        })

      if (insertError) {
        if (
          insertError.code === '23505' ||
          insertError.message.includes('At most two')
        ) {
          return NextResponse.json(
            { error: 'User is already a member of this study' },
            { status: 409 }
          )
        }
        return NextResponse.json({ error: insertError.message }, { status: 500 })
      }

      const stateHash = await generateHash({
        study_id: studyId,
        user_id: identity.user_id,
        role,
        granted_by: user.id,
      })
      await createAuditEvent(
        studyId,
        user.id,
        'study_member_invited',
        'study_member',
        identity.user_id,
        null,
        stateHash,
        { role, orcid_id: orcidId }
      )
      return NextResponse.json({ success: true })
    }

    // ORCID not registered: create pending invitation (require matching ORCID login to accept)
    if (policy.institutionId && !policy.allowExternalCollaborators) {
      return NextResponse.json(
        {
          error:
            institutionOnlyMessage +
            ' Pending ORCID invites are not allowed while institution members only is enabled.',
        },
        { status: 403 }
      )
    }

    const expiresAt = getPendingInviteExpiresAt()
    const { rawToken, tokenHash } = generateInviteToken()
    if (emailTrim) {
      await revokeExpiredPendingStudyEmailInvite(supabase, studyId, emailTrim)
    }
    const { data: invite, error: inviteError } = await supabase
      .from('study_member_invites')
      .insert({
        study_id: studyId,
        orcid_id: orcidId,
        email: emailTrim || null,
        role,
        invited_by: user.id,
        expires_at: expiresAt.toISOString(),
        token_hash: tokenHash,
      })
      .select('id')
      .single()

    if (inviteError) {
      return NextResponse.json({ error: inviteError.message }, { status: 500 })
    }

    const stateHash = await generateHash({
      study_id: studyId,
      invite_id: invite.id,
      orcid_id: orcidId,
      role,
    })
    await createAuditEvent(
      studyId,
      user.id,
      'study_member_invited',
      'study_member_invite',
      invite.id,
      null,
      stateHash,
      { role, orcid_id: orcidId, pending: true }
    )
    const createdHash = await generateHash({
      study_id: studyId,
      invite_id: invite.id,
      action: 'invite_created',
    })
    await createAuditEvent(
      studyId,
      user.id,
      'invite_created',
      'study_member_invite',
      invite.id,
      null,
      createdHash,
      { role, orcid_id: orcidId, pending: true, kind: 'study' }
    )
    let emailDispatch: ReturnType<typeof inviteEmailDispatchFields> | null = null
    if (emailTrim) {
      const orcidInviteAdmin = createAdminClient()
      const emailResult = await sendPendingInviteEmail({
        to: emailTrim,
        kind: 'study',
        contextLabel: policy.studyTitle,
        inviteRawToken: rawToken,
        expiresAtIso: expiresAt.toISOString(),
        supabaseAdmin: orcidInviteAdmin,
      })
      emailDispatch = inviteEmailDispatchFields(emailResult)
    }
    return NextResponse.json({
      success: true,
      pending: true,
      expires_at: expiresAt.toISOString(),
      message:
        'Invitation created. They can accept from the Invites page after signing in with this ORCID (email notification sent if an address was provided and mail is configured).',
      ...(emailDispatch ?? {}),
    })
  }

  // Email-based invite (existing behavior)
  if (!emailTrim) {
    return NextResponse.json(
      { error: 'Email is required for email-based invite' },
      { status: 400 }
    )
  }
  const admin = createAdminClient()
  const existingUserId = await findUserIdByEmail(admin, emailTrim)

  const { data: duplicateOpenInvite } = await supabase
    .from('study_member_invites')
    .select('id')
    .eq('study_id', studyId)
    .ilike('email', emailTrim)
    .is('accepted_at', null)
    .is('revoked_at', null)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle()

  if (duplicateOpenInvite) {
    return NextResponse.json(
      { error: 'A pending invite already exists for this email on this study.' },
      { status: 400 }
    )
  }

  if (!existingUserId) {
    if (!policy.allowExternalCollaborators && policy.institutionId) {
      return NextResponse.json(
        {
          error:
            'No account exists for that email. With institution members only, invite them to the institution first, or temporarily allow external collaborators to send a study-only invite.',
        },
        { status: 403 }
      )
    }

    const roomNew = await assertRoomForNewStudyParticipant(supabase, studyId, null)
    if (!roomNew.ok) {
      return NextResponse.json({ error: roomNew.message }, { status: 403 })
    }

    let rawToken: string
    let pendingExpiresAt: string
    try {
      ;({ rawToken, expiresAt: pendingExpiresAt } = await createPendingStudyInviteByEmail({
        supabase,
        studyId,
        invitedBy: user.id,
        emailTrim,
        role,
        auditExtra: { no_account_yet: true },
      }))
    } catch (e: unknown) {
      const err = e as { code?: string; message?: string }
      if (err.code === '23505') {
        return NextResponse.json(
          { error: 'A pending invite already exists for this email on this study.' },
          { status: 400 }
        )
      }
      return NextResponse.json(
        { error: err.message ?? 'Failed to create invite' },
        { status: 500 }
      )
    }

    const emailResult = await sendPendingInviteEmail({
      to: emailTrim,
      kind: 'study',
      contextLabel: policy.studyTitle,
      inviteRawToken: rawToken,
      expiresAtIso: pendingExpiresAt,
      supabaseAdmin: admin,
    })

    return NextResponse.json({
      success: true,
      pending: true,
      expires_at: pendingExpiresAt,
      message:
        'Pending invite created. They should sign up with this email and accept under Invites when signed in. An email was sent if outbound mail is configured.',
      ...inviteEmailDispatchFields(emailResult),
    })
  }

  if (
    policy.institutionId &&
    !policy.allowExternalCollaborators &&
    !(await isActiveInstitutionMember(existingUserId, policy.institutionId))
  ) {
    return NextResponse.json({ error: institutionOnlyMessage }, { status: 403 })
  }

  const acE = await activeStudyAssignmentCount(supabase, studyId, existingUserId)
  if (acE >= 2) {
    return NextResponse.json(
      {
        error:
          'User already has the maximum number of roles on this study. Revoke a role before sending another invite.',
      },
      { status: 409 }
    )
  }

  if (acE === 0) {
    const roomEx = await assertRoomForNewStudyParticipant(supabase, studyId, existingUserId)
    if (!roomEx.ok) {
      return NextResponse.json({ error: roomEx.message }, { status: 403 })
    }
  }

  let rawTokenExisting: string
  let pendingExpiresExisting: string
  try {
    ;({ rawToken: rawTokenExisting, expiresAt: pendingExpiresExisting } =
      await createPendingStudyInviteByEmail({
        supabase,
        studyId,
        invitedBy: user.id,
        emailTrim,
        role,
        auditExtra: { existing_auth_user: true },
      }))
  } catch (e: unknown) {
    const err = e as { code?: string; message?: string }
    if (err.code === '23505') {
      return NextResponse.json(
        { error: 'A pending invite already exists for this email on this study.' },
        { status: 400 }
      )
    }
    return NextResponse.json(
      { error: err.message ?? 'Failed to create invite' },
      { status: 500 }
    )
  }

  const emailResultExisting = await sendExistingUserPendingInviteNotification({
    to: emailTrim,
    kind: 'study',
    contextLabel: policy.studyTitle,
    inviteRawToken: rawTokenExisting,
    expiresAtIso: pendingExpiresExisting,
  })

  return NextResponse.json({
    success: true,
    pending: true,
    expires_at: pendingExpiresExisting,
    message:
      'Pending invite created. They already have an account—ask them to sign in and accept under Invites. They were emailed if Resend is configured.',
    ...inviteEmailDispatchFields(emailResultExisting),
  })
}

export async function PATCH(
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

  const activeCheck = await assertStudyIsActive(supabase, studyId)
  if (!activeCheck.ok) {
    return NextResponse.json({ error: activeCheck.error }, { status: 403 })
  }

  const body = await request.json()
  const { memberId, revoked } = body as { memberId?: string; revoked?: boolean }

  if (!memberId || revoked !== true) {
    return NextResponse.json(
      { error: 'memberId and revoked: true required' },
      { status: 400 }
    )
  }

  const { data: member, error: fetchError } = await supabase
    .from('study_members')
    .select('id, user_id, role, role_definition_id')
    .eq('id', memberId)
    .eq('study_id', studyId)
    .is('revoked_at', null)
    .single()

  if (fetchError || !member) {
    return NextResponse.json({ error: 'Member not found' }, { status: 404 })
  }

  const { data: activeRows, error: countErr } = await supabase
    .from('study_members')
    .select('id, user_id, role')
    .eq('study_id', studyId)
    .is('revoked_at', null)

  if (countErr) {
    return NextResponse.json({ error: countErr.message ?? 'Count failed' }, { status: 500 })
  }

  const remainingUsers = new Set<string>()
  const remainingPrivilegedUsers = new Set<string>()
  for (const r of activeRows ?? []) {
    if (r.id === member.id) continue
    remainingUsers.add(r.user_id)
    if (r.role === 'admin' || r.role === 'creator') {
      remainingPrivilegedUsers.add(r.user_id)
    }
  }

  const decision = validateStudyMemberRevocation({
    actorId: user.id,
    targetUserId: member.user_id,
    targetRole: member.role,
    remainingDistinctMemberCount: remainingUsers.size,
    remainingPrivilegedDistinctUserCount: remainingPrivilegedUsers.size,
  })

  if (!decision.ok) {
    return NextResponse.json({ error: decision.message }, { status: 403 })
  }

  const now = new Date().toISOString()
  if (member.role_definition_id) {
    const { error: raErr } = await supabase
      .from('study_member_role_assignments')
      .update({ revoked_at: now })
      .eq('study_id', studyId)
      .eq('user_id', member.user_id)
      .eq('role_definition_id', member.role_definition_id)
      .is('revoked_at', null)

    if (raErr) {
      return NextResponse.json({ error: raErr.message }, { status: 500 })
    }
  } else {
    const { error } = await supabase
      .from('study_members')
      .update({ revoked_at: now })
      .eq('id', memberId)
      .eq('study_id', studyId)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
  }

  const stateHash = await generateHash({
    study_id: studyId,
    user_id: member.user_id,
    role: member.role,
    revoked_by: user.id,
  })

  await createAuditEvent(
    studyId,
    user.id,
    'member_removed',
    'study_member',
    member.id,
    null,
    stateHash,
    { user_id: member.user_id, role: member.role }
  )

  return NextResponse.json({ success: true })
}
