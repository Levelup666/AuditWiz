import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createAuditEvent } from '@/lib/supabase/audit'
import { generateHash } from '@/lib/crypto'

/**
 * GET: resolve share by token (query param). Returns record version for read-only view.
 * Logs share_access_events via RPC and share_accessed audit event. Does not require auth.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ recordVersionId: string }> }
) {
  const { recordVersionId } = await params
  const token = request.nextUrl.searchParams.get('token')

  if (!token?.trim()) {
    return NextResponse.json({ error: 'Missing token' }, { status: 400 })
  }

  const accessTokenHash = await generateHash(token)
  const supabase = await createClient()

  const { data: artifact, error: artError } = await supabase
    .from('shared_artifacts')
    .select('id, record_version_id, expires_at')
    .eq('record_version_id', recordVersionId)
    .eq('access_token_hash', accessTokenHash)
    .single()

  if (artError || !artifact) {
    return NextResponse.json({ error: 'Invalid or expired share link' }, { status: 404 })
  }

  if (new Date(artifact.expires_at) <= new Date()) {
    return NextResponse.json({ error: 'Share link has expired' }, { status: 410 })
  }

  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    null
  const userAgent = request.headers.get('user-agent') || null

  await supabase.rpc('create_share_access_event', {
    p_shared_artifact_id: artifact.id,
    p_ip_address: ip,
    p_user_agent: userAgent,
  })

  const admin = createAdminClient()
  const { data: recordForStudy } = await admin
    .from('records')
    .select('study_id')
    .eq('id', artifact.record_version_id)
    .single()
  const studyId = recordForStudy?.study_id ?? null
  const stateHash = await generateHash({
    shared_artifact_id: artifact.id,
    accessed_at: new Date().toISOString(),
    ip,
  })
  await createAuditEvent(
    studyId,
    null,
    'share_accessed',
    'shared_artifact',
    artifact.id,
    null,
    stateHash,
    { ip, user_agent: userAgent }
  )
  const { data: record, error: recError } = await admin
    .from('records')
    .select('id, study_id, record_number, version, status, content, content_hash, created_at, amendment_reason, created_by')
    .eq('id', artifact.record_version_id)
    .single()

  if (recError || !record) {
    return NextResponse.json({ error: 'Record not found' }, { status: 404 })
  }

  const { data: anchor } = await admin
    .from('blockchain_anchors')
    .select('transaction_hash, block_number, anchored_at')
    .eq('record_id', record.id)
    .eq('record_version', record.version)
    .maybeSingle()

  return NextResponse.json({
    record: {
      id: record.id,
      record_number: record.record_number,
      version: record.version,
      status: record.status,
      content: record.content,
      content_hash: record.content_hash,
      created_at: record.created_at,
      amendment_reason: record.amendment_reason,
    },
    anchor: anchor
      ? {
          transaction_hash: anchor.transaction_hash,
          block_number: anchor.block_number,
          anchored_at: anchor.anchored_at,
        }
      : null,
    read_only: true,
  })
}
