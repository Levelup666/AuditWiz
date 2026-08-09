import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getOwnedActiveEngagement } from '@/lib/auditor/assert-engagement-access'

/** Read-only: download engagement letter for the owning auditor. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ engagementId: string }> }
) {
  const { engagementId } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const engagement = await getOwnedActiveEngagement(supabase, user.id, engagementId)
  if (!engagement) {
    return NextResponse.json({ error: 'Engagement not found or not active' }, { status: 404 })
  }

  if (!engagement.engagement_letter_file_path) {
    return NextResponse.json({ error: 'No engagement letter attached' }, { status: 404 })
  }

  const admin = createAdminClient()
  const { data: blob, error: dlErr } = await admin.storage
    .from('documents')
    .download(engagement.engagement_letter_file_path)

  if (dlErr || !blob) {
    return NextResponse.json({ error: dlErr?.message ?? 'Download failed' }, { status: 500 })
  }

  const bytes = Buffer.from(await blob.arrayBuffer())
  const fileName = engagement.engagement_letter_file_name ?? 'engagement-letter.pdf'
  return new NextResponse(bytes, {
    status: 200,
    headers: {
      'Content-Type': engagement.engagement_letter_mime_type ?? 'application/pdf',
      'Content-Disposition': `attachment; filename="${fileName.replace(/"/g, '')}"`,
      'Cache-Control': 'private, no-store',
    },
  })
}
