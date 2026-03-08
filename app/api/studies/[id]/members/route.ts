import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { canManageStudyMembers } from '@/lib/supabase/permissions'
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
    .select('id, user_id, role, granted_at, granted_by, can_view, can_comment, can_review, can_approve, can_share')
    .eq('study_id', studyId)
    .is('revoked_at', null)
    .order('granted_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const admin = createAdminClient()
  const emails: Record<string, string> = {}
  const orcidIds: Record<string, string> = {}
  for (const m of members || []) {
    try {
      const { data: u } = await admin.auth.admin.getUserById(m.user_id)
      if (u?.user?.email) emails[m.user_id] = u.user.email
    } catch {
      emails[m.user_id] = m.user_id.slice(0, 8) + '…'
    }
    const { data: profile } = await supabase.from('profiles').select('orcid_id').eq('id', m.user_id).maybeSingle()
    if (profile?.orcid_id) orcidIds[m.user_id] = profile.orcid_id
  }

  const withEmails = (members || []).map((m) => ({
    ...m,
    email: emails[m.user_id] ?? m.user_id.slice(0, 8) + '…',
    orcid_id: orcidIds[m.user_id] ?? null,
  }))

  return NextResponse.json(withEmails)
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

  const body = await request.json().catch(() => ({}))
  const { email, orcid_id: orcidIdRaw, role } = body as {
    email?: string
    orcid_id?: string
    role?: string
  }

  const emailTrim = email?.trim()
  const orcidId =
    orcidIdRaw != null && String(orcidIdRaw).trim() !== ''
      ? String(orcidIdRaw).trim().replace(/-/g, '').replace(/(\d{4})(\d{4})(\d{4})(\d{3}[\dX])/i, '$1-$2-$3-$4')
      : null

  if ((!emailTrim && !orcidId) || !role) {
    return NextResponse.json(
      { error: 'Either email or orcid_id is required, and role is required' },
      { status: 400 }
    )
  }

  if (!VALID_ROLES.includes(role as any)) {
    return NextResponse.json({ error: 'Invalid role' }, { status: 400 })
  }

  const flags = permissionFlagsForRole(role)

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
      const { error: insertError } = await supabase.from('study_members').insert({
        study_id: studyId,
        user_id: identity.user_id,
        role,
        granted_by: user.id,
        ...flags,
      })

      if (insertError) {
        if (insertError.code === '23505') {
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
    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + 7)
    const { data: invite, error: inviteError } = await supabase
      .from('study_member_invites')
      .insert({
        study_id: studyId,
        orcid_id: orcidId,
        email: emailTrim || null,
        role,
        invited_by: user.id,
        expires_at: expiresAt.toISOString(),
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
    return NextResponse.json({
      success: true,
      pending: true,
      message:
        'Invitation created. They must sign in with this ORCID to accept.',
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
  const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
  const found = list?.users?.find(
    (u) => u.email?.toLowerCase() === emailTrim.toLowerCase()
  )

  if (!found) {
    return NextResponse.json(
      { error: 'No user found with that email. They must sign up first.' },
      { status: 404 }
    )
  }

  const { error: insertError } = await supabase.from('study_members').insert({
    study_id: studyId,
    user_id: found.id,
    role,
    granted_by: user.id,
    ...flags,
  })

  if (insertError) {
    if (insertError.code === '23505') {
      return NextResponse.json(
        { error: 'User is already a member of this study' },
        { status: 409 }
      )
    }
    return NextResponse.json({ error: insertError.message }, { status: 500 })
  }

  const stateHash = await generateHash({
    study_id: studyId,
    user_id: found.id,
    role,
    granted_by: user.id,
  })
  await createAuditEvent(
    studyId,
    user.id,
    'study_member_invited',
    'study_member',
    found.id,
    null,
    stateHash,
    { role, email: emailTrim }
  )

  return NextResponse.json({ success: true })
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

  const body = await request.json()
  const { memberId, revoked } = body as { memberId?: string; revoked?: boolean }

  if (!memberId || revoked !== true) {
    return NextResponse.json(
      { error: 'memberId and revoked: true required' },
      { status: 400 }
    )
  }

  const { error } = await supabase
    .from('study_members')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', memberId)
    .eq('study_id', studyId)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
