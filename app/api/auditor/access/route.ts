import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { userHasActiveEngagement } from '@/lib/auditor/engagements'

/** Drives the "Auditor" nav link (similar to /api/audit/access for Logs). */
export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ hasActiveEngagement: false }, { status: 401 })
  }

  const has = await userHasActiveEngagement(user.id)
  return NextResponse.json({ hasActiveEngagement: has })
}
