import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { canManageStudyMembers } from '@/lib/supabase/permissions'
import { createAuditEvent } from '@/lib/supabase/audit'
import { generateHash } from '@/lib/crypto'

export async function POST(
  request: NextRequest,
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
    return NextResponse.json(
      { error: 'You do not have permission to delete this study' },
      { status: 403 }
    )
  }

  const { data: study, error: studyError } = await supabase
    .from('studies')
    .select('id, title')
    .eq('id', studyId)
    .single()

  if (studyError || !study) {
    return NextResponse.json({ error: 'Study not found' }, { status: 404 })
  }

  const { count: approvedCount } = await supabase
    .from('records')
    .select('id', { count: 'exact', head: true })
    .eq('study_id', studyId)
    .eq('status', 'approved')

  if (approvedCount && approvedCount > 0) {
    return NextResponse.json(
      {
        error:
          'Cannot delete study: it contains approved or blockchain-anchored records. Remove or reject those records first.',
      },
      { status: 400 }
    )
  }

  const { data: records } = await supabase
    .from('records')
    .select('id')
    .eq('study_id', studyId)

  const recordIds = (records ?? []).map((r) => r.id)
  if (recordIds.length > 0) {
    const { count: anchoredCount } = await supabase
      .from('blockchain_anchors')
      .select('id', { count: 'exact', head: true })
      .in('record_id', recordIds)

    if (anchoredCount && anchoredCount > 0) {
      return NextResponse.json(
        {
          error:
            'Cannot delete study: it contains approved or blockchain-anchored records. Remove or reject those records first.',
        },
        { status: 400 }
      )
    }
  }

  const { data: members } = await supabase
    .from('study_members')
    .select('user_id')
    .eq('study_id', studyId)
    .is('revoked_at', null)

  const memberUserIds = [...new Set((members ?? []).map((m) => m.user_id).filter(Boolean))]

  const previousHash = await generateHash({
    study_id: studyId,
    title: study.title,
  })
  const newHash = await generateHash({ deleted: true, study_id: studyId })

  await createAuditEvent(
    studyId,
    user.id,
    'study_deleted',
    'study',
    studyId,
    previousHash,
    newHash,
    {
      study_title: study.title,
      study_id: studyId,
      deleted_by: user.id,
      member_count: memberUserIds.length,
    }
  )

  const admin = createAdminClient()
  const notifications = memberUserIds.map((userId) => ({
    user_id: userId,
    type: 'study_deleted',
    title: 'Study deleted',
    body: `Study "${study.title}" was deleted by an administrator.`,
    metadata: { study_id: studyId, study_title: study.title, deleted_by: user.id },
  }))

  if (notifications.length > 0) {
    const { error: notifError } = await admin
      .from('notifications')
      .insert(notifications)

    if (notifError) {
      console.error('Failed to create notifications for study delete', notifError)
    }
  }

  const { error: deleteError } = await supabase
    .from('studies')
    .delete()
    .eq('id', studyId)

  if (deleteError) {
    return NextResponse.json(
      { error: deleteError.message || 'Failed to delete study' },
      { status: 500 }
    )
  }

  return NextResponse.json({ success: true })
}
