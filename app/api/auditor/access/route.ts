import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { userHasActiveEngagement } from '@/lib/auditor/engagements'
import { userIsAuditorPrimary } from '@/lib/auditor/is-auditor-primary'

/** Drives the "Auditor" nav link and auditor-primary workspace shell. */
export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json(
      { hasActiveEngagement: false, auditorPrimary: false },
      { status: 401 }
    )
  }

  const has = await userHasActiveEngagement(user.id)
  const auditorPrimary = has ? await userIsAuditorPrimary(supabase, user.id) : false
  return NextResponse.json({ hasActiveEngagement: has, auditorPrimary })
}
