import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getUnreadNotificationCount } from '@/lib/notifications'

export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const count = await getUnreadNotificationCount(user.id)
  return NextResponse.json({ count })
}
