import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { listActiveEngagementsForUser } from '@/lib/auditor/engagements'

export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ engagements: [] }, { status: 401 })
  }

  const engagements = await listActiveEngagementsForUser(supabase, user.id)
  return NextResponse.json({ engagements })
}
