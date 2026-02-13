import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { canCreateRecord } from '@/lib/supabase/permissions'
import { createAuditEvent } from '@/lib/supabase/audit'
import { generateHash } from '@/lib/crypto'
import { createHash, randomUUID } from 'crypto'

const BUCKET = 'documents'

export async function GET(
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

  const { data: docs, error } = await supabase
    .from('documents')
    .select('id, file_name, file_path, file_hash, file_size, mime_type, uploaded_at')
    .eq('record_id', recordId)
    .order('uploaded_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(docs ?? [])
}

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
    .select('id, study_id')
    .eq('id', recordId)
    .single()

  if (recError || !record) {
    return NextResponse.json({ error: 'Record not found' }, { status: 404 })
  }

  const allowed = await canCreateRecord(user.id, record.study_id)
  if (!allowed) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const formData = await request.formData()
  const file = formData.get('file') as File | null
  if (!file || !file.size) {
    return NextResponse.json({ error: 'file is required' }, { status: 400 })
  }

  const buffer = Buffer.from(await file.arrayBuffer())
  const fileHash = createHash('sha256').update(buffer).digest('hex')
  const fileName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
  const filePath = `${recordId}/${randomUUID()}-${fileName}`

  const admin = createAdminClient()
  const { error: uploadError } = await admin.storage
    .from(BUCKET)
    .upload(filePath, buffer, {
      contentType: file.type || 'application/octet-stream',
      upsert: false,
    })

  if (uploadError) {
    return NextResponse.json(
      { error: uploadError.message || 'Upload failed. Ensure the "documents" bucket exists in Supabase Storage.' },
      { status: 500 }
    )
  }

  const { data: doc, error: insertError } = await supabase
    .from('documents')
    .insert({
      record_id: recordId,
      file_name: file.name,
      file_path: filePath,
      file_hash: fileHash,
      file_size: file.size,
      mime_type: file.type || 'application/octet-stream',
      uploaded_by: user.id,
    })
    .select('id')
    .single()

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 })
  }

  const stateHash = await generateHash({ document_id: doc.id, file_path: filePath, file_hash: fileHash })
  await createAuditEvent(
    record.study_id,
    user.id,
    'document_uploaded',
    'document',
    doc.id,
    null,
    stateHash,
    { file_name: file.name, record_id: recordId }
  )

  return NextResponse.json({ success: true, id: doc.id })
}
