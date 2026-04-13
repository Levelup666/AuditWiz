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
  const userEmailNorm = user.email?.trim().toLowerCase() ?? ''

  const { data: orcidRows } = await supabase
    .from('user_identities')
    .select('provider_id')
    .eq('user_id', user.id)
    .eq('provider', 'orcid')
    .is('revoked_at', null)
  const userOrcids = new Set((orcidRows || []).map((r) => r.provider_id))

  const { data: studyRows, error: sErr } = await supabase
    .from('study_member_invites')
    .select('id, email, orcid_id')
    .is('accepted_at', null)
    .is('revoked_at', null)
    .gt('expires_at', now)

  const { data: instRows, error: iErr } = await supabase
    .from('institution_invites')
    .select('id, email')
    .is('accepted_at', null)
    .is('revoked_at', null)
    .gt('expires_at', now)

  if (sErr || iErr) {
    return NextResponse.json({ study: 0, institution: 0, total: 0 })
  }

  const study = (studyRows || []).filter((inv) => {
    if (userEmailNorm && inv.email && inv.email.trim().toLowerCase() === userEmailNorm) return true
    if (inv.orcid_id && userOrcids.has(inv.orcid_id)) return true
    return false
  }).length

  const institution = (instRows || []).filter((inv) => {
    if (!userEmailNorm || !inv.email) return false
    return inv.email.trim().toLowerCase() === userEmailNorm
  }).length

  const total = study + institution

  return NextResponse.json({ study, institution, total })
}
