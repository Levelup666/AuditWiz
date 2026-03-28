import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { canManageStudyMembers } from '@/lib/supabase/permissions'
import { assertStudyIsActive } from '@/lib/supabase/study-status'
import { createAuditEvent } from '@/lib/supabase/audit'
import { generateHash } from '@/lib/crypto'

const BUCKET = 'documents'

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

  const { data: record, error: recError } = await supabase
    .from('records')
    .select('id, study_id, record_number, version, status, content_hash')
    .eq('id', recordId)
    .single()

  if (recError || !record) {
    return NextResponse.json({ error: 'Record not found' }, { status: 404 })
  }

  const allowed = await canManageStudyMembers(user.id, record.study_id)
  if (!allowed) {
    return NextResponse.json(
      { error: 'You do not have permission to delete records in this study' },
      { status: 403 }
    )
  }

  const activeCheck = await assertStudyIsActive(supabase, record.study_id)
  if (!activeCheck.ok) {
    return NextResponse.json({ error: activeCheck.error }, { status: 403 })
  }

  if (record.status !== 'draft' && record.status !== 'rejected') {
    return NextResponse.json(
      {
        error:
          'Only draft or rejected records can be deleted. Records that have been submitted, approved, or amended cannot be deleted.',
      },
      { status: 400 }
    )
  }

  const { data: referencedBy } = await supabase
    .from('records')
    .select('id')
    .eq('previous_version_id', recordId)
    .limit(1)
    .maybeSingle()

  if (referencedBy) {
    return NextResponse.json(
      {
        error:
          'Cannot delete this record: it is part of an amendment chain. A later version references it.',
      },
      { status: 400 }
    )
  }

  const { data: documents } = await supabase
    .from('documents')
    .select('id, file_path')
    .eq('record_id', recordId)

  const admin = createAdminClient()
  if (documents && documents.length > 0) {
    const paths = documents.map((d) => d.file_path)
    const { error: storageError } = await admin.storage.from(BUCKET).remove(paths)
    if (storageError) {
      console.error('Storage cleanup failed for record', recordId, storageError)
    }
  }

  const previousHash = await generateHash({
    record_id: recordId,
    record_number: record.record_number,
    version: record.version,
    content_hash: record.content_hash,
  })
  const newHash = await generateHash({ deleted: true, record_id: recordId })

  await createAuditEvent(
    record.study_id,
    user.id,
    'record_deleted',
    'record',
    recordId,
    previousHash,
    newHash,
    {
      record_number: record.record_number,
      version: record.version,
      status: record.status,
    }
  )

  const { error: deleteError } = await supabase
    .from('records')
    .delete()
    .eq('id', recordId)

  if (deleteError) {
    return NextResponse.json(
      { error: deleteError.message || 'Failed to delete record' },
      { status: 500 }
    )
  }

  return NextResponse.json({ success: true })
}
