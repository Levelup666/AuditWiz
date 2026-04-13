import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { canManageStudyMembers } from '@/lib/supabase/permissions'
import { getStudyCollaborationPolicy } from '@/lib/study-institution-policy'
import { formatMemberListName } from '@/lib/profile/member-display-name'

export type StudyMemberCandidate = {
  user_id: string
  email: string
  display_name: string | null
  member_display_name: string
  orcid_id: string | null
}

/**
 * Institution members not yet on this study (for internal-only or internal invite UX).
 * Uses service role after permission check so study admins can list candidates even if
 * they are not institution admins (RLS would otherwise hide rows).
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: studyId } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const allowed = await canManageStudyMembers(user.id, studyId)
  if (!allowed) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { data: study, error: studyErr } = await supabase
    .from('studies')
    .select('institution_id')
    .eq('id', studyId)
    .maybeSingle()

  if (studyErr || !study) {
    return NextResponse.json({ error: 'Study not found' }, { status: 404 })
  }

  const policy = await getStudyCollaborationPolicy(studyId)

  if (!study.institution_id) {
    return NextResponse.json({
      candidates: [] as StudyMemberCandidate[],
      institutionId: null as string | null,
      allowExternalCollaborators: policy.allowExternalCollaborators,
    })
  }

  const admin = createAdminClient()

  const { data: studyRows, error: smErr } = await admin
    .from('study_members')
    .select('user_id')
    .eq('study_id', studyId)
    .is('revoked_at', null)

  if (smErr) {
    return NextResponse.json({ error: smErr.message }, { status: 500 })
  }

  const assignmentCountByUser = new Map<string, number>()
  for (const r of studyRows ?? []) {
    assignmentCountByUser.set(
      r.user_id,
      (assignmentCountByUser.get(r.user_id) ?? 0) + 1
    )
  }

  const { data: instRows, error: imErr } = await admin
    .from('institution_members')
    .select('user_id')
    .eq('institution_id', study.institution_id)
    .is('revoked_at', null)

  if (imErr) {
    return NextResponse.json({ error: imErr.message }, { status: 500 })
  }

  const candidates: StudyMemberCandidate[] = []

  for (const row of instRows ?? []) {
    const ac = assignmentCountByUser.get(row.user_id) ?? 0
    if (ac >= 2) continue

    const { data: profile } = await admin
      .from('profiles')
      .select('display_name, orcid_id, first_name, last_name, nickname')
      .eq('id', row.user_id)
      .maybeSingle()

    let email = ''
    try {
      const { data: u } = await admin.auth.admin.getUserById(row.user_id)
      email = u?.user?.email ?? ''
    } catch {
      email = ''
    }

    const member_display_name = formatMemberListName(
      {
        nickname: profile?.nickname,
        first_name: profile?.first_name,
        last_name: profile?.last_name,
        display_name: profile?.display_name,
      },
      { email, userId: row.user_id }
    )

    candidates.push({
      user_id: row.user_id,
      email,
      display_name: profile?.display_name ?? null,
      member_display_name,
      orcid_id: profile?.orcid_id ?? null,
    })
  }

  candidates.sort((a, b) => {
    const ae = (a.member_display_name || a.email || a.user_id).toLowerCase()
    const be = (b.member_display_name || b.email || b.user_id).toLowerCase()
    return ae.localeCompare(be)
  })

  return NextResponse.json({
    candidates,
    institutionId: study.institution_id,
    allowExternalCollaborators: policy.allowExternalCollaborators,
  })
}
