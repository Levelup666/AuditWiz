import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { acceptAuditEngagementForUser } from '@/lib/invites/accept-audit-engagement'

/** Accept a pending audit engagement by id (in-app invites hub; email must match). */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ engagementId: string }> }
) {
  const { engagementId } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const setupNext = `/invites/audit/${engagementId}`
  const setupPath = `/account/setup?next=${encodeURIComponent(setupNext)}&auditor_invite=1`

  const { data: profile } = await supabase
    .from('profiles')
    .select('account_setup_completed_at, first_name, last_name')
    .eq('id', user.id)
    .maybeSingle()

  if (!profile?.account_setup_completed_at) {
    return NextResponse.json(
      {
        error: 'Complete account setup before accepting this audit engagement.',
        requires_account_setup: true,
        setup_path: setupPath,
      },
      { status: 428 }
    )
  }

  if (!profile?.first_name?.trim() || !profile?.last_name?.trim()) {
    return NextResponse.json(
      {
        error: 'Add your first and last name in account setup before accepting.',
        requires_account_setup: true,
        setup_path: setupPath,
      },
      { status: 428 }
    )
  }

  const body = await request.json().catch(() => ({}))
  const credentials = {
    organizationName:
      typeof body.organization_name === 'string' ? body.organization_name : '',
    title: typeof body.title === 'string' ? body.title : '',
    referenceId: typeof body.reference_id === 'string' ? body.reference_id : '',
    attested: body.attested === true || body.attested === 'true' || body.attested === 'on',
  }

  const { data: engagement, error: fetchErr } = await supabase
    .from('audit_engagements')
    .select('id, institution_id')
    .eq('id', engagementId)
    .maybeSingle()

  if (fetchErr || !engagement) {
    return NextResponse.json({ error: 'Engagement not found' }, { status: 404 })
  }

  const result = await acceptAuditEngagementForUser(
    supabase,
    user.id,
    user.email ?? undefined,
    engagement.institution_id,
    engagement.id,
    credentials
  )

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, code: result.code },
      { status: result.status }
    )
  }

  return NextResponse.json({
    success: true,
    engagement_id: result.engagementId,
    institution_id: result.institutionId,
  })
}
