import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { canManageInstitution } from '@/lib/supabase/permissions'
import { attachEngagementLetter } from '@/lib/auditor/attach-engagement-letter'

/** Institution admin: attach engagement letter / scope PDF (no replacement). */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; engagementId: string }> }
) {
  const { id: institutionId, engagementId } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const allowed = await canManageInstitution(user.id, institutionId)
  if (!allowed) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const formData = await request.formData()
  const file = formData.get('file') as File | null
  if (!file || !file.size) {
    return NextResponse.json({ error: 'file is required' }, { status: 400 })
  }

  const buffer = Buffer.from(await file.arrayBuffer())
  const admin = createAdminClient()
  const result = await attachEngagementLetter({
    supabase,
    admin,
    institutionId,
    engagementId,
    uploadedBy: user.id,
    file: {
      name: file.name,
      type: file.type || 'application/pdf',
      size: file.size,
      buffer,
    },
  })

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, code: result.code },
      { status: result.status }
    )
  }

  return NextResponse.json({
    success: true,
    file_name: result.fileName,
    file_hash: result.fileHash,
    file_size: result.fileSize,
    mime_type: result.mimeType,
  })
}

/** Institution admin or engagement auditor: download letter bytes. */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; engagementId: string }> }
) {
  const { id: institutionId, engagementId } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: engagement, error } = await supabase
    .from('audit_engagements')
    .select(
      `id, institution_id, auditor_user_id, auditor_email, accepted_at, revoked_at, expires_at,
       engagement_letter_file_path, engagement_letter_file_name, engagement_letter_mime_type`
    )
    .eq('id', engagementId)
    .eq('institution_id', institutionId)
    .maybeSingle()

  if (error || !engagement) {
    return NextResponse.json({ error: 'Engagement not found' }, { status: 404 })
  }

  const isAdmin = await canManageInstitution(user.id, institutionId)
  const isAcceptedAuditor = engagement.auditor_user_id === user.id
  const isPendingInvitee =
    !engagement.accepted_at &&
    !engagement.revoked_at &&
    new Date(engagement.expires_at) > new Date() &&
    Boolean(user.email) &&
    user.email.trim().toLowerCase() === (engagement.auditor_email ?? '').trim().toLowerCase()

  if (!isAdmin && !isAcceptedAuditor && !isPendingInvitee) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
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
