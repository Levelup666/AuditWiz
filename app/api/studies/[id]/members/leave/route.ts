import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getStudyMemberPermissions } from '@/lib/supabase/permissions'
import { validateStudyMemberSelfDeparture } from '@/lib/supabase/member-revocation'
import {
  computeRemainingMemberCounts,
  emitStudyMemberRemovedAudit,
  removeOpenTaskAssigneesForUser,
  revokeStudyMemberRow,
} from '@/lib/study-member-revoke'
import {
  getStudyManagerUserIds,
  resolveUserEmail,
  resolveUserEmails,
  sendStudyMemberDepartedEmails,
} from '@/lib/email/study-member-departed'
import { notifyStudyMemberDeparted } from '@/lib/notifications/study-events'
import { resolveMemberDisplayName } from '@/lib/profile/resolve-member-display'
import { parseMemberRemovalNote } from '@/lib/member-removal-note'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: studyId } = await params
  const body = await request.json().catch(() => ({}))
  const noteResult = parseMemberRemovalNote(body.removalNote)
  if (!noteResult.ok) {
    return NextResponse.json({ error: noteResult.error }, { status: 400 })
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const perms = await getStudyMemberPermissions(user.id, studyId)
  if (!perms?.can_view) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { data: member, error: memberErr } = await supabase
    .from('study_members')
    .select('id, user_id, role, role_definition_id')
    .eq('study_id', studyId)
    .eq('user_id', user.id)
    .is('revoked_at', null)
    .maybeSingle()

  if (memberErr) {
    return NextResponse.json({ error: memberErr.message }, { status: 500 })
  }
  if (!member) {
    return NextResponse.json({ error: 'You are not an active member of this study' }, { status: 404 })
  }

  const { data: activeRows, error: countErr } = await supabase
    .from('study_members')
    .select('id, user_id, role')
    .eq('study_id', studyId)
    .is('revoked_at', null)

  if (countErr) {
    return NextResponse.json({ error: countErr.message }, { status: 500 })
  }

  const counts = computeRemainingMemberCounts(activeRows ?? [], member.id)
  const decision = validateStudyMemberSelfDeparture({
    targetRole: member.role,
    ...counts,
  })

  if (!decision.ok) {
    return NextResponse.json({ error: decision.message }, { status: 403 })
  }

  const admin = createAdminClient()

  const taskCleanup = await removeOpenTaskAssigneesForUser(admin, studyId, user.id)
  if (!taskCleanup.ok) {
    return NextResponse.json({ error: taskCleanup.message }, { status: 500 })
  }

  const revokeResult = await revokeStudyMemberRow(admin, studyId, member)
  if (!revokeResult.ok) {
    return NextResponse.json({ error: revokeResult.message }, { status: 500 })
  }

  await emitStudyMemberRemovedAudit({
    studyId,
    actorUserId: user.id,
    member,
    extraMetadata: {
      self_departed: true,
      reason: 'voluntary',
      removal_note: noteResult.note,
    },
  })

  const { data: study } = await admin
    .from('studies')
    .select('title')
    .eq('id', studyId)
    .single()

  const studyTitle = (study?.title as string) || 'Study'
  const managerIds = await getStudyManagerUserIds(admin, studyId)

  await notifyStudyMemberDeparted(admin, {
    studyId,
    studyTitle,
    departedUserId: user.id,
    adminUserIds: managerIds,
  })

  const { data: profile } = await admin
    .from('profiles')
    .select('display_name, first_name, last_name, nickname')
    .eq('id', user.id)
    .maybeSingle()

  const departedEmail = await resolveUserEmail(admin, user.id)
  const departedLabel = resolveMemberDisplayName(
    profile,
    user.user_metadata as Record<string, unknown> | undefined,
    departedEmail ?? undefined
  )

  const adminEmails = await resolveUserEmails(
    admin,
    managerIds.filter((id) => id !== user.id)
  )

  await sendStudyMemberDepartedEmails({
    adminEmails,
    studyTitle,
    studyId,
    departedMemberLabel: departedLabel,
  })

  return NextResponse.json({ success: true })
}
