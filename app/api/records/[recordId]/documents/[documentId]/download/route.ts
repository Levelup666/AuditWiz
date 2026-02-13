import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

const BUCKET = 'documents'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ recordId: string; documentId: string }> }
) {
  const { recordId, documentId } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: doc, error } = await supabase
    .from('documents')
    .select('id, file_path, file_name')
    .eq('id', documentId)
    .eq('record_id', recordId)
    .single()

  if (error || !doc) {
    return NextResponse.json({ error: 'Document not found' }, { status: 404 })
  }

  const admin = createAdminClient()
  const { data: signed } = await admin.storage
    .from(BUCKET)
    .createSignedUrl(doc.file_path, 60)

  if (!signed?.signedUrl) {
    return NextResponse.json({ error: 'Failed to create download link' }, { status: 500 })
  }

  return NextResponse.redirect(signed.signedUrl)
}
