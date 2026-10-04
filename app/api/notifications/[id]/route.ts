import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { deleteNotification } from '@/lib/notifications'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: notificationId } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!UUID_RE.test(notificationId)) {
    return NextResponse.json({ error: 'Invalid notification id' }, { status: 400 })
  }

  const result = await deleteNotification(user.id, notificationId)
  if (!result.ok) {
    return NextResponse.json({ error: 'Could not delete notification' }, { status: 500 })
  }
  if (!result.deleted) {
    return NextResponse.json({ error: 'Notification not found' }, { status: 404 })
  }

  return NextResponse.json({ success: true })
}
