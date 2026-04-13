import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { hashInviteToken } from '@/lib/invites/token'
import { lookupInviteByTokenHash } from '@/lib/invites/lookup-invite-by-token'
import { acceptStudyInviteForUser } from '@/lib/invites/accept-study'
import { acceptInstitutionInviteForUser } from '@/lib/invites/accept-institution'

export async function POST(request: NextRequest) {
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
  const rawToken = typeof body.token === 'string' ? body.token.trim() : ''
  if (!rawToken) {
    return NextResponse.json({ error: 'token is required' }, { status: 400 })
  }

  const admin = createAdminClient()
  const tokenHash = hashInviteToken(rawToken)
  const resolved = await lookupInviteByTokenHash(admin, tokenHash)

  if (!resolved) {
    return NextResponse.json({ error: 'Invite not found' }, { status: 404 })
  }

  if (resolved.revokedAt) {
    return NextResponse.json({ error: 'This invite was revoked' }, { status: 410 })
  }

  if (resolved.acceptedAt) {
    return NextResponse.json({ error: 'Invite already accepted' }, { status: 409 })
  }

  if (new Date(resolved.expiresAt) <= new Date()) {
    return NextResponse.json({ error: 'Invite has expired' }, { status: 410 })
  }

  if (resolved.kind === 'study') {
    const result = await acceptStudyInviteForUser(
      supabase,
      user.id,
      user.email ?? undefined,
      resolved.studyId,
      resolved.inviteId
    )
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }
    return NextResponse.json({
      success: true,
      kind: 'study',
      study_id: resolved.studyId,
    })
  }

  const result = await acceptInstitutionInviteForUser(
    supabase,
    user.id,
    user.email ?? undefined,
    resolved.institutionId,
    resolved.inviteId
  )
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }
  return NextResponse.json({
    success: true,
    kind: 'institution',
    institution_id: resolved.institutionId,
  })
}
