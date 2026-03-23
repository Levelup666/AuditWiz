import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/** Pending invite counts for the signed-in user (for nav badge). */
export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ study: 0, institution: 0, total: 0 })
  }

  const now = new Date().toISOString()

  const { count: studyCount, error: sErr } = await supabase
    .from('study_member_invites')
    .select('id', { count: 'exact', head: true })
    .is('accepted_at', null)
    .gt('expires_at', now)

  const { count: instCount, error: iErr } = await supabase
    .from('institution_invites')
    .select('id', { count: 'exact', head: true })
    .is('accepted_at', null)
    .gt('expires_at', now)

  if (sErr || iErr) {
    return NextResponse.json({ study: 0, institution: 0, total: 0 })
  }

  const study = studyCount ?? 0
  const institution = instCount ?? 0
  return NextResponse.json({ study, institution, total: study + institution })
}
