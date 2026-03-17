import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAuditEvent } from '@/lib/supabase/audit'
import { generateHash } from '@/lib/crypto'

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

  const body = await request.json().catch(() => ({}))
  const { invite_id: inviteId } = body as { invite_id?: string }

  if (!inviteId) {
    return NextResponse.json({ error: 'invite_id is required' }, { status: 400 })
  }

  const { data: invite, error: inviteError } = await supabase
    .from('institution_invites')
    .select('id, institution_id, email, role, invited_by, expires_at, accepted_at')
    .eq('id', inviteId)
    .eq('institution_id', institutionId)
    .single()

  if (inviteError || !invite) {
    return NextResponse.json({ error: 'Invite not found' }, { status: 404 })
  }

  if (invite.accepted_at) {
    return NextResponse.json({ error: 'Invite already accepted' }, { status: 409 })
  }

  if (new Date(invite.expires_at) <= new Date()) {
    return NextResponse.json({ error: 'Invite has expired' }, { status: 410 })
  }

  const userEmail = user.email?.toLowerCase()
  const inviteEmail = invite.email?.toLowerCase()
  if (userEmail !== inviteEmail) {
    return NextResponse.json(
      { error: 'This invite was sent to a different email address' },
      { status: 403 }
    )
  }

  const { error: updateError } = await supabase
    .from('institution_invites')
    .update({
      accepted_at: new Date().toISOString(),
      accepted_by: user.id,
    })
    .eq('id', inviteId)

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  const { error: memberError } = await supabase.from('institution_members').insert({
    institution_id: institutionId,
    user_id: user.id,
    role: invite.role,
    granted_by: invite.invited_by,
  })

  if (memberError) {
    return NextResponse.json({ error: memberError.message }, { status: 500 })
  }

  const stateHash = await generateHash({
    user_id: user.id,
    institution_id: institutionId,
    role: invite.role,
  })

  await createAuditEvent(
    null,
    user.id,
    'institution_member_joined',
    'institution',
    institutionId,
    null,
    stateHash,
    {
      institution_id: institutionId,
      invite_id: inviteId,
      role: invite.role,
    }
  )

  return NextResponse.json({ success: true })
}
