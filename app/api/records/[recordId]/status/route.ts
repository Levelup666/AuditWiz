import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAuditEvent } from '@/lib/supabase/audit'
import { generateHash } from '@/lib/crypto'
import { canCreateRecord, canApproveRecord, canReviewRecord } from '@/lib/supabase/permissions'

const ALLOWED_STATUSES = ['submitted', 'under_review', 'rejected'] as const

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ recordId: string }> }
) {
  const { recordId } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { status, reason } = body as { status?: string; reason?: string }

  if (!status || !ALLOWED_STATUSES.includes(status as typeof ALLOWED_STATUSES[number])) {
    return NextResponse.json(
      { error: `status must be one of: ${ALLOWED_STATUSES.join(', ')}` },
      { status: 400 }
    )
  }

  const { data: record, error: fetchError } = await supabase
    .from('records')
    .select('id, study_id, status, content_hash, record_number, version')
    .eq('id', recordId)
    .single()

  if (fetchError || !record) {
    return NextResponse.json({ error: 'Record not found' }, { status: 404 })
  }

  const studyId = record.study_id

  if (status === 'under_review' || status === 'submitted') {
    const allowed = await canCreateRecord(user.id, studyId)
    if (!allowed) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    if (record.status !== 'draft') {
      return NextResponse.json(
        { error: 'Only draft records can be submitted for review' },
        { status: 400 }
      )
    }
  }

  if (status === 'rejected') {
    const allowed = await canReviewRecord(user.id, studyId) || await canApproveRecord(user.id, studyId)
    if (!allowed) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    if (record.status !== 'under_review' && record.status !== 'submitted') {
      return NextResponse.json(
        { error: 'Only records under review can be rejected' },
        { status: 400 }
      )
    }
  }

  const previousStateHash = record.content_hash
  const newStateHash = await generateHash({
    ...record,
    status,
    status_reason: reason ?? null,
  })

  const { error: updateError } = await supabase
    .from('records')
    .update({ status })
    .eq('id', recordId)

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  const actionType = status === 'rejected' ? 'record_rejected' : 'record_submitted'
  await createAuditEvent(
    studyId,
    user.id,
    actionType,
    'record',
    recordId,
    previousStateHash,
    newStateHash,
    {
      record_number: record.record_number,
      version: record.version,
      new_status: status,
      reason: reason ?? null,
    }
  )

  return NextResponse.json({ success: true, status })
}
