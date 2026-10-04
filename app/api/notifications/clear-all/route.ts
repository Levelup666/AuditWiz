import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { deleteAllNotifications } from '@/lib/notifications'

export async function DELETE() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const result = await deleteAllNotifications(user.id)
  if (!result.ok) {
    return NextResponse.json({ error: 'Could not clear notifications' }, { status: 500 })
  }

  return NextResponse.json({ success: true, deleted: result.count })
}
