import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createAuditEventWithClient } from '@/lib/supabase/audit'
import { generateHash } from '@/lib/crypto'

/** Decline a pending audit engagement by id. */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ engagementId: string }> }
) {
  const { engagementId } = await params
  const supabase = await createClient()
  const admin = createAdminClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: engagement } = await supabase
    .from('audit_engagements')
    .select('id, institution_id, auditor_email, accepted_at, revoked_at, expires_at')
    .eq('id', engagementId)
    .maybeSingle()

  if (!engagement) {
    return NextResponse.json({ error: 'Engagement not found' }, { status: 404 })
  }

  const userEmailNorm = user.email?.trim().toLowerCase() ?? ''
  const inviteEmailNorm = engagement.auditor_email?.trim().toLowerCase() ?? ''
  if (!userEmailNorm || userEmailNorm !== inviteEmailNorm) {
    return NextResponse.json({ error: 'This engagement is for a different email address.' }, { status: 403 })
  }

  if (engagement.accepted_at) {
    return NextResponse.json({ error: 'Engagement already accepted' }, { status: 409 })
  }
  if (engagement.revoked_at) {
    return NextResponse.json({ error: 'Engagement already declined or revoked' }, { status: 410 })
  }
  if (new Date(engagement.expires_at) <= new Date()) {
    return NextResponse.json({ error: 'Engagement has expired' }, { status: 410 })
  }

  const now = new Date().toISOString()
  const { data: updatedRows, error: upErr } = await admin
    .from('audit_engagements')
    .update({ revoked_at: now, revocation_reason: 'declined_by_invitee' })
    .eq('id', engagementId)
    .is('accepted_at', null)
    .is('revoked_at', null)
    .select('id')

  if (upErr || !updatedRows?.length) {
    return NextResponse.json({ error: upErr?.message ?? 'Could not decline engagement' }, { status: 500 })
  }

  const stateHash = await generateHash({
    engagement_id: engagementId,
    declined_at: now,
    declined_by: user.id,
  })
  await createAuditEventWithClient(
    admin,
    null,
    user.id,
    'invite_rejected',
    'audit_engagement',
    engagementId,
    null,
    stateHash,
    { institution_id: engagement.institution_id, engagement_id: engagementId }
  )

  return NextResponse.json({ success: true })
}
