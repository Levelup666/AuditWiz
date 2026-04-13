import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { canManageInstitution } from '@/lib/supabase/permissions'
import { createAuditEvent } from '@/lib/supabase/audit'
import { generateHash } from '@/lib/crypto'
import {
  inviteEmailDispatchFields,
  sendPendingInviteEmail,
} from '@/lib/email/pending-invite-notification'
import { generateInviteToken } from '@/lib/invites/token'
import { getPendingInviteExpiresAt } from '@/lib/invites/pending-invite-expiry'

const VALID_ROLES = ['admin', 'member'] as const

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: institutionId } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const allowed = await canManageInstitution(user.id, institutionId)
  if (!allowed) {
    return NextResponse.json(
      { error: 'You do not have permission to invite users to this institution' },
      { status: 403 }
    )
  }

  const { data: institution } = await supabase
    .from('institutions')
    .select('id, name')
    .eq('id', institutionId)
    .single()

  if (!institution) {
    return NextResponse.json({ error: 'Institution not found' }, { status: 404 })
  }

  const body = await request.json().catch(() => ({}))
  const { email, role } = body as { email?: string; role?: string }

  const emailTrim = email?.trim()
  if (!emailTrim) {
    return NextResponse.json(
      { error: 'Email is required' },
      { status: 400 }
    )
  }

  if (!VALID_ROLES.includes(role as (typeof VALID_ROLES)[number])) {
    return NextResponse.json(
      { error: 'Invalid role. Must be admin or member.' },
      { status: 400 }
    )
  }

  const admin = createAdminClient()
  const { data: users } = await admin.auth.admin.listUsers()
  const existingUserByEmail = users.users.find(
    (u) => u.email?.toLowerCase() === emailTrim.toLowerCase()
  )

  if (existingUserByEmail) {
    const { data: existingMember } = await supabase
      .from('institution_members')
      .select('id')
      .eq('institution_id', institutionId)
      .eq('user_id', existingUserByEmail.id)
      .is('revoked_at', null)
      .maybeSingle()

    if (existingMember) {
      return NextResponse.json(
        { error: 'This user is already a member of the institution' },
        { status: 400 }
      )
    }
  }

  const expiresAt = getPendingInviteExpiresAt()

  const { rawToken, tokenHash } = generateInviteToken()

  const { data: invite, error: inviteError } = await supabase
    .from('institution_invites')
    .insert({
      institution_id: institutionId,
      email: emailTrim,
      role,
      invited_by: user.id,
      expires_at: expiresAt.toISOString(),
      token_hash: tokenHash,
    })
    .select('id')
    .single()

  if (inviteError) {
    if (inviteError.code === '23505') {
      const { data: existingInvite } = await supabase
        .from('institution_invites')
        .select('id')
        .eq('institution_id', institutionId)
        .eq('email', emailTrim)
        .is('accepted_at', null)
        .gt('expires_at', new Date().toISOString())
        .maybeSingle()
      if (existingInvite) {
        return NextResponse.json(
          { error: 'An invite is already pending for this email' },
          { status: 400 }
        )
      }
    }
    return NextResponse.json({ error: inviteError.message }, { status: 500 })
  }

  const stateHash = await generateHash({
    invite_id: invite.id,
    institution_id: institutionId,
    email: emailTrim,
    role,
  })

  await createAuditEvent(
    null,
    user.id,
    'institution_member_invited',
    'institution_invite',
    invite.id,
    null,
    stateHash,
    {
      institution_id: institutionId,
      institution_name: institution.name,
      email: emailTrim,
      role,
    }
  )

  const createdHash = await generateHash({
    invite_id: invite.id,
    institution_id: institutionId,
    action: 'invite_created',
  })
  await createAuditEvent(
    null,
    user.id,
    'invite_created',
    'institution_invite',
    invite.id,
    null,
    createdHash,
    {
      institution_id: institutionId,
      email: emailTrim,
      role,
      kind: 'institution',
    }
  )

  const emailResult = await sendPendingInviteEmail({
    to: emailTrim,
    kind: 'institution',
    contextLabel: institution.name,
    inviteRawToken: rawToken,
    expiresAtIso: expiresAt.toISOString(),
    supabaseAdmin: admin,
  })

  return NextResponse.json({
    success: true,
    id: invite.id,
    expires_at: expiresAt.toISOString(),
    ...inviteEmailDispatchFields(emailResult),
  })
}
