import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { declineStudyInviteForUser } from '@/lib/invites/decline-study'

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
  const inviteId = typeof body.invite_id === 'string' ? body.invite_id.trim() : ''
  if (!inviteId) {
    return NextResponse.json({ error: 'invite_id is required' }, { status: 400 })
  }

  const admin = createAdminClient()
  const result = await declineStudyInviteForUser(
    supabase,
    admin,
    user.id,
    user.email ?? undefined,
    studyId,
    inviteId
  )

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }

  revalidatePath('/invites')
  revalidatePath(`/invites/study/${inviteId}`)
  revalidatePath(`/studies/${studyId}`)

  return NextResponse.json({ success: true })
}
