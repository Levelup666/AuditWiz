import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { markAllNotificationsRead } from '@/lib/notifications'

export async function POST() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const ok = await markAllNotificationsRead(user.id)
  if (!ok) {
    return NextResponse.json({ error: 'Could not mark notifications read' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
