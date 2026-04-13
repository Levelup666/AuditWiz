import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { acceptInstitutionInviteForUser } from '@/lib/invites/accept-institution'

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

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('account_setup_completed_at, first_name, last_name')
    .eq('id', user.id)
    .maybeSingle()
  if (profileError) {
    return NextResponse.json({ error: profileError.message }, { status: 500 })
  }
  if (!profile?.account_setup_completed_at) {
    return NextResponse.json(
      {
        error: 'Set a password in account setup before accepting this invitation.',
        requires_account_setup: true,
        setup_path: '/account/setup?next=/invites',
      },
      { status: 428 }
    )
  }
  if (!profile?.first_name?.trim() || !profile?.last_name?.trim()) {
    return NextResponse.json(
      {
        error: 'Add your first and last name in account setup before accepting this invitation.',
        requires_account_setup: true,
        setup_path: '/account/setup?next=/invites',
      },
      { status: 428 }
    )
  }

  const body = await request.json().catch(() => ({}))
  const { invite_id: inviteId } = body as { invite_id?: string }

  if (!inviteId) {
    return NextResponse.json({ error: 'invite_id is required' }, { status: 400 })
  }

  const result = await acceptInstitutionInviteForUser(
    supabase,
    user.id,
    user.email ?? undefined,
    institutionId,
    inviteId
  )

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }

  return NextResponse.json({ success: true })
}
