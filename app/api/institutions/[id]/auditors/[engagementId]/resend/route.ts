import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { canManageInstitution } from '@/lib/supabase/permissions'
import { createAuditEvent } from '@/lib/supabase/audit'
import { generateHash } from '@/lib/crypto'
import { generateInviteToken } from '@/lib/invites/token'
import {
  inviteEmailDispatchFields,
  sendExistingUserPendingInviteNotification,
  sendPendingInviteEmail,
} from '@/lib/email/pending-invite-notification'
import { findUserIdByEmail } from '@/lib/supabase/find-user-by-email'

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; engagementId: string }> }
) {
  const { id: institutionId, engagementId } = await params
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

  const { data: engagement, error: fetchErr } = await supabase
    .from('audit_engagements')
    .select('id, auditor_email, accepted_at, revoked_at, expires_at, resend_count')
    .eq('id', engagementId)
    .eq('institution_id', institutionId)
    .maybeSingle()
  if (fetchErr || !engagement) {
    return NextResponse.json({ error: 'Engagement not found' }, { status: 404 })
  }
  if (engagement.revoked_at) {
    return NextResponse.json({ error: 'Engagement is revoked' }, { status: 410 })
  }
  if (engagement.accepted_at) {
    return NextResponse.json(
      { error: 'Engagement is already accepted; resend is unnecessary' },
      { status: 409 }
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

  // Rotate the bearer token: any in-flight copies of the previous link become unusable.
  const { rawToken, tokenHash } = generateInviteToken()
  const nowIso = new Date().toISOString()

  const { error: updErr } = await supabase
    .from('audit_engagements')
    .update({
      token_hash: tokenHash,
      last_sent_at: nowIso,
      resend_count: (engagement.resend_count ?? 0) + 1,
    })
    .eq('id', engagementId)
    .eq('institution_id', institutionId)
    .is('revoked_at', null)
    .is('accepted_at', null)

  if (updErr) {
    return NextResponse.json({ error: updErr.message }, { status: 500 })
  }

  const stateHash = await generateHash({
    engagement_id: engagementId,
    institution_id: institutionId,
    resent_at: nowIso,
    resent_by: user.id,
  })
  await createAuditEvent(
    null,
    user.id,
    'invite_resent',
    'audit_engagement',
    engagementId,
    null,
    stateHash,
    {
      institution_id: institutionId,
      kind: 'audit_engagement',
      auditor_email: engagement.auditor_email,
    }
  )

  const admin = createAdminClient()
  const existingUserId = await findUserIdByEmail(admin, engagement.auditor_email)
  const emailResult = existingUserId
    ? await sendExistingUserPendingInviteNotification({
        to: engagement.auditor_email,
        kind: 'audit_engagement',
        contextLabel: institution.name,
        inviteRawToken: rawToken,
        expiresAtIso: engagement.expires_at,
      })
    : await sendPendingInviteEmail({
        to: engagement.auditor_email,
        kind: 'audit_engagement',
        contextLabel: institution.name,
        inviteRawToken: rawToken,
        expiresAtIso: engagement.expires_at,
        supabaseAdmin: admin,
      })

  return NextResponse.json({
    success: true,
    ...inviteEmailDispatchFields(emailResult),
  })
}
