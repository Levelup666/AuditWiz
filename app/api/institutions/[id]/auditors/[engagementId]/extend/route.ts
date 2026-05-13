import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { canManageInstitution } from '@/lib/supabase/permissions'
import { createAuditEvent } from '@/lib/supabase/audit'
import { generateHash } from '@/lib/crypto'

const MIN_DAYS = 1
const MAX_DAYS = 365

export async function POST(
  request: NextRequest,
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

  const body = await request.json().catch(() => ({}))
  const days = Number(body.additional_days)
  if (!Number.isFinite(days)) {
    return NextResponse.json({ error: 'additional_days is required' }, { status: 400 })
  }
  const clampedDays = Math.min(MAX_DAYS, Math.max(MIN_DAYS, Math.floor(days)))

  const { data: engagement, error: fetchErr } = await supabase
    .from('audit_engagements')
    .select('id, expires_at, accepted_at, revoked_at, auditor_email')
    .eq('id', engagementId)
    .eq('institution_id', institutionId)
    .maybeSingle()
  if (fetchErr || !engagement) {
    return NextResponse.json({ error: 'Engagement not found' }, { status: 404 })
  }
  if (engagement.revoked_at) {
    return NextResponse.json({ error: 'Engagement is revoked' }, { status: 410 })
  }

  const baseline = new Date(
    Math.max(new Date(engagement.expires_at).getTime(), Date.now())
  )
  const newExpiry = new Date(baseline.getTime())
  newExpiry.setUTCDate(newExpiry.getUTCDate() + clampedDays)

  const { error: updErr } = await supabase
    .from('audit_engagements')
    .update({ expires_at: newExpiry.toISOString() })
    .eq('id', engagementId)
    .eq('institution_id', institutionId)
    .is('revoked_at', null)

  if (updErr) {
    return NextResponse.json({ error: updErr.message }, { status: 500 })
  }

  const stateHash = await generateHash({
    engagement_id: engagementId,
    institution_id: institutionId,
    previous_expires_at: engagement.expires_at,
    new_expires_at: newExpiry.toISOString(),
    extended_by: user.id,
  })
  await createAuditEvent(
    null,
    user.id,
    'audit_engagement_extended',
    'audit_engagement',
    engagementId,
    null,
    stateHash,
    {
      institution_id: institutionId,
      auditor_email: engagement.auditor_email,
      previous_expires_at: engagement.expires_at,
      new_expires_at: newExpiry.toISOString(),
      additional_days: clampedDays,
    }
  )

  return NextResponse.json({ success: true, expires_at: newExpiry.toISOString() })
}
