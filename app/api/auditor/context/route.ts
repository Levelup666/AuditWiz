import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { userIsDualRoleAuditor } from '@/lib/auditor/is-auditor-primary'
import {
  ACTIVE_CONTEXT_COOKIE,
  parseActiveContext,
  type ActiveContext,
} from '@/lib/auditor/active-context'

const COOKIE_MAX_AGE = 60 * 60 * 24 * 180 // 180 days

/** Dual-role users set preferred UI context: auditor | member. */
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const dualRole = await userIsDualRoleAuditor(supabase, user.id)
  if (!dualRole) {
    return NextResponse.json(
      { error: 'Context switching is only available when you have both memberships and an audit engagement.' },
      { status: 403 }
    )
  }

  const body = await request.json().catch(() => ({}))
  const context = parseActiveContext(
    typeof body.context === 'string' ? body.context : null
  ) as ActiveContext | null
  if (!context) {
    return NextResponse.json(
      { error: 'context must be "auditor" or "member"' },
      { status: 400 }
    )
  }

  const cookieStore = await cookies()
  cookieStore.set(ACTIVE_CONTEXT_COOKIE, context, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: COOKIE_MAX_AGE,
  })

  return NextResponse.json({ success: true, activeContext: context })
}
