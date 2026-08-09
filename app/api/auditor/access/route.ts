import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { userHasActiveEngagement } from '@/lib/auditor/engagements'
import {
  userIsAuditorPrimary,
  userIsDualRoleAuditor,
} from '@/lib/auditor/is-auditor-primary'
import {
  ACTIVE_CONTEXT_COOKIE,
  resolveActiveContext,
  shouldPresentAuditorShell,
} from '@/lib/auditor/active-context'

/** Drives the Auditor nav link, dual-role context, and auditor shell. */
export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json(
      {
        hasActiveEngagement: false,
        auditorPrimary: false,
        dualRole: false,
        activeContext: null,
        presentAuditorShell: false,
      },
      { status: 401 }
    )
  }

  const has = await userHasActiveEngagement(user.id)
  const auditorPrimary = has ? await userIsAuditorPrimary(supabase, user.id) : false
  const dualRole = has && !auditorPrimary ? await userIsDualRoleAuditor(supabase, user.id) : false
  const cookieStore = await cookies()
  const activeContext = resolveActiveContext({
    auditorPrimary,
    dualRole,
    cookieValue: cookieStore.get(ACTIVE_CONTEXT_COOKIE)?.value,
  })
  const presentAuditorShell = shouldPresentAuditorShell({
    auditorPrimary,
    dualRole,
    activeContext,
  })

  return NextResponse.json({
    hasActiveEngagement: has,
    auditorPrimary,
    dualRole,
    activeContext,
    presentAuditorShell,
  })
}
