import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { canManageInstitution } from '@/lib/supabase/permissions'
import { createAuditEvent } from '@/lib/supabase/audit'
import { generateHash } from '@/lib/crypto'
import { validateInstitutionMemberRevocation } from '@/lib/supabase/member-revocation'

export async function GET(
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
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { data: members, error } = await supabase
    .from('institution_members')
    .select('id, user_id, role, granted_at, granted_by')
    .eq('institution_id', institutionId)
    .is('revoked_at', null)
    .order('granted_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const admin = createAdminClient()
  const emails: Record<string, string> = {}
  for (const m of members || []) {
    try {
      const { data: u } = await admin.auth.admin.getUserById(m.user_id)
      if (u?.user?.email) emails[m.user_id] = u.user.email
    } catch {
      emails[m.user_id] = m.user_id.slice(0, 8) + '…'
    }
  }

  const withEmails = (members || []).map((m) => ({
    ...m,
    email: emails[m.user_id] ?? m.user_id.slice(0, 8) + '…',
  }))

  return NextResponse.json(withEmails)
}

export async function PATCH(
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
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json().catch(() => ({}))
  const { memberId, revoked } = body as { memberId?: string; revoked?: boolean }

  if (!memberId || revoked !== true) {
    return NextResponse.json(
      { error: 'memberId and revoked: true required' },
      { status: 400 }
    )
  }

  const { data: member, error: fetchError } = await supabase
    .from('institution_members')
    .select('id, user_id, role')
    .eq('id', memberId)
    .eq('institution_id', institutionId)
    .is('revoked_at', null)
    .single()

  if (fetchError || !member) {
    return NextResponse.json({ error: 'Member not found' }, { status: 404 })
  }

  const { count: memberCount, error: countErr } = await supabase
    .from('institution_members')
    .select('*', { count: 'exact', head: true })
    .eq('institution_id', institutionId)
    .is('revoked_at', null)

  const { count: adminCount, error: adminErr } = await supabase
    .from('institution_members')
    .select('*', { count: 'exact', head: true })
    .eq('institution_id', institutionId)
    .is('revoked_at', null)
    .eq('role', 'admin')

  if (countErr || adminErr) {
    return NextResponse.json(
      { error: countErr?.message ?? adminErr?.message ?? 'Count failed' },
      { status: 500 }
    )
  }

  const decision = validateInstitutionMemberRevocation({
    actorId: user.id,
    targetUserId: member.user_id,
    targetRole: member.role,
    activeMemberCount: memberCount ?? 0,
    activeAdminCount: adminCount ?? 0,
  })

  if (!decision.ok) {
    return NextResponse.json({ error: decision.message }, { status: 403 })
  }

  const { error } = await supabase
    .from('institution_members')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', memberId)
    .eq('institution_id', institutionId)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const stateHash = await generateHash({
    institution_id: institutionId,
    user_id: member.user_id,
    role: member.role,
    revoked_by: user.id,
  })

  await createAuditEvent(
    null,
    user.id,
    'institution_member_removed',
    'institution_member',
    member.user_id,
    null,
    stateHash,
    { institution_id: institutionId, role: member.role }
  )

  return NextResponse.json({ success: true })
}
