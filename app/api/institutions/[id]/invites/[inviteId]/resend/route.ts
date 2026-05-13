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

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; inviteId: string }> }
) {
  const { id: institutionId, inviteId } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const allowed = await canManageInstitution(user.id, institutionId)
  if (!allowed) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { data: institution } = await supabase
    .from('institutions')
    .select('id, name')
    .eq('id', institutionId)
    .single()

  if (!institution) {
    return NextResponse.json({ error: 'Institution not found' }, { status: 404 })
  }

  const { data: inviteRow, error: fetchErr } = await supabase
    .from('institution_invites')
    .select('id, email, role, accepted_at, revoked_at, resend_count')
    .eq('id', inviteId)
    .eq('institution_id', institutionId)
    .maybeSingle()

  if (fetchErr || !inviteRow) {
    return NextResponse.json({ error: 'Invite not found' }, { status: 404 })
  }

  if (inviteRow.accepted_at) {
    return NextResponse.json({ error: 'This invite was already accepted' }, { status: 409 })
  }
  if (inviteRow.revoked_at) {
    return NextResponse.json({ error: 'This invite was revoked' }, { status: 410 })
  }

  const expiresAt = getPendingInviteExpiresAt()
  const { rawToken, tokenHash } = generateInviteToken()
  const nowIso = new Date().toISOString()
  const nextResend = (inviteRow.resend_count ?? 0) + 1

  const { data: updated, error: updErr } = await supabase
    .from('institution_invites')
    .update({
      token_hash: tokenHash,
      expires_at: expiresAt.toISOString(),
      last_sent_at: nowIso,
      resend_count: nextResend,
    })
    .eq('id', inviteId)
    .eq('institution_id', institutionId)
    .is('accepted_at', null)
    .is('revoked_at', null)
    .select('id, email, role, resend_count')
    .maybeSingle()

  if (updErr || !updated) {
    return NextResponse.json(
      { error: updErr?.message ?? 'Could not update invite' },
      { status: 500 }
    )
  }

  const resentHash = await generateHash({
    invite_id: inviteId,
    institution_id: institutionId,
    action: 'invite_resent',
    resend_count: updated.resend_count,
  })
  await createAuditEvent(
    null,
    user.id,
    'invite_resent',
    'institution_invite',
    inviteId,
    null,
    resentHash,
    {
      institution_id: institutionId,
      institution_name: institution.name,
      email: inviteRow.email,
      role: inviteRow.role,
      resend_count: updated.resend_count,
    }
  )

  const admin = createAdminClient()
  const emailResult = await sendPendingInviteEmail({
    to: inviteRow.email,
    kind: 'institution',
    contextLabel: institution.name,
    inviteRawToken: rawToken,
    expiresAtIso: expiresAt.toISOString(),
    supabaseAdmin: admin,
  })

  return NextResponse.json({
    success: true,
    id: inviteId,
    expires_at: expiresAt.toISOString(),
    resend_count: updated.resend_count,
    ...inviteEmailDispatchFields(emailResult),
  })
}
