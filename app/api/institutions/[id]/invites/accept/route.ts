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
