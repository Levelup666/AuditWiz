import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { canManageStudyMembers } from '@/lib/supabase/permissions'
import { acceptStudyInviteForUser } from '@/lib/invites/accept-study'

const VALID_ROLES = ['creator', 'reviewer', 'approver', 'auditor', 'admin'] as const

/** GET: list pending invites for the study (admins only) */
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

  const { data: invites, error } = await supabase
    .from('study_member_invites')
    .select('id, orcid_id, email, role, invited_at, expires_at')
    .eq('study_id', studyId)
    .is('accepted_at', null)
    .is('revoked_at', null)
    .gt('expires_at', new Date().toISOString())
    .order('invited_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(invites ?? [])
}

/** POST: accept a pending invite (caller must have matching ORCID or email) */
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

  const body = await request.json().catch(() => ({}))
  const { invite_id: inviteId } = body as { invite_id?: string }

  if (!inviteId) {
    return NextResponse.json({ error: 'invite_id is required' }, { status: 400 })
  }

  const result = await acceptStudyInviteForUser(
    supabase,
    user.id,
    user.email ?? undefined,
    studyId,
    inviteId
  )

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }

  return NextResponse.json({ success: true })
}
