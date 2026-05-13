import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { canManageInstitution } from '@/lib/supabase/permissions'
import { createAuditEvent } from '@/lib/supabase/audit'
import { generateHash } from '@/lib/crypto'

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
  const reason = typeof body.reason === 'string' ? body.reason.trim() : ''

  const { data: engagement, error: fetchErr } = await supabase
    .from('audit_engagements')
    .select('id, auditor_email, scope, accepted_at, revoked_at, expires_at')
    .eq('id', engagementId)
    .eq('institution_id', institutionId)
    .maybeSingle()
  if (fetchErr || !engagement) {
    return NextResponse.json({ error: 'Engagement not found' }, { status: 404 })
  }
  if (engagement.revoked_at) {
    return NextResponse.json({ error: 'Engagement is already revoked' }, { status: 410 })
  }

  const nowIso = new Date().toISOString()
  const { error: updErr } = await supabase
    .from('audit_engagements')
    .update({
      revoked_at: nowIso,
      revocation_reason: reason.length > 0 ? reason : 'admin_revoked',
    })
    .eq('id', engagementId)
    .eq('institution_id', institutionId)
    .is('revoked_at', null)

  if (updErr) {
    return NextResponse.json({ error: updErr.message }, { status: 500 })
  }

  const stateHash = await generateHash({
    engagement_id: engagementId,
    institution_id: institutionId,
    revoked_at: nowIso,
    reason,
    revoked_by: user.id,
  })
  await createAuditEvent(
    null,
    user.id,
    'audit_engagement_revoked',
    'audit_engagement',
    engagementId,
    null,
    stateHash,
    {
      institution_id: institutionId,
      auditor_email: engagement.auditor_email,
      reason: reason.length > 0 ? reason : 'admin_revoked',
    }
  )

  return NextResponse.json({ success: true })
}
