import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { canManageInstitution } from '@/lib/supabase/permissions'
import { createAuditEvent } from '@/lib/supabase/audit'
import { generateHash } from '@/lib/crypto'

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
    .select('id, email, role, accepted_at, revoked_at')
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
    return NextResponse.json({ error: 'This invite was already revoked' }, { status: 410 })
  }

  const nowIso = new Date().toISOString()
  const { data: updatedRows, error: updErr } = await supabase
    .from('institution_invites')
    .update({ revoked_at: nowIso })
    .eq('id', inviteId)
    .eq('institution_id', institutionId)
    .is('accepted_at', null)
    .is('revoked_at', null)
    .select('id')

  if (updErr || !updatedRows?.length) {
    return NextResponse.json(
      { error: updErr?.message ?? 'Could not revoke invite' },
      { status: 500 }
    )
  }

  const revokeHash = await generateHash({
    invite_id: inviteId,
    institution_id: institutionId,
    action: 'invite_revoked',
  })
  await createAuditEvent(
    null,
    user.id,
    'invite_revoked',
    'institution_invite',
    inviteId,
    null,
    revokeHash,
    {
      institution_id: institutionId,
      institution_name: institution.name,
      email: inviteRow.email,
      role: inviteRow.role,
    }
  )

  return NextResponse.json({ success: true })
}
