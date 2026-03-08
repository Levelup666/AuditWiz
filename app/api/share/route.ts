import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createAuditEvent } from '@/lib/supabase/audit'
import { generateHash } from '@/lib/crypto'
import { canShareRecord } from '@/lib/supabase/permissions'
import { randomBytes } from 'crypto'

/** POST: create a read-only share link for a record version. Requires can_share. */
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => ({}))
  const { record_version_id: recordVersionId, expires_in_days = 30 } = body as {
    record_version_id?: string
    expires_in_days?: number
  }

  if (!recordVersionId) {
    return NextResponse.json(
      { error: 'record_version_id is required' },
      { status: 400 }
    )
  }

  const days = Math.min(Math.max(1, Number(expires_in_days) || 30), 365)
  const expiresAt = new Date()
  expiresAt.setDate(expiresAt.getDate() + days)

  const { data: record, error: recError } = await supabase
    .from('records')
    .select('id, study_id, record_number, version, status')
    .eq('id', recordVersionId)
    .single()

  if (recError || !record) {
    return NextResponse.json({ error: 'Record not found' }, { status: 404 })
  }

  if (record.status !== 'approved') {
    return NextResponse.json(
      { error: 'Only approved record versions can be shared' },
      { status: 400 }
    )
  }

  const allowed = await canShareRecord(user.id, record.study_id)
  if (!allowed) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const rawToken = randomBytes(32).toString('hex')
  const accessTokenHash = await generateHash(rawToken)

  const { data: artifact, error: insertError } = await supabase
    .from('shared_artifacts')
    .insert({
      record_version_id: recordVersionId,
      created_by: user.id,
      permission_level: 'read',
      expires_at: expiresAt.toISOString(),
      access_token_hash: accessTokenHash,
    })
    .select('id')
    .single()

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 })
  }

  const stateHash = await generateHash({
    shared_artifact_id: artifact.id,
    record_version_id: recordVersionId,
    created_by: user.id,
    expires_at: expiresAt.toISOString(),
  })
  await createAuditEvent(
    record.study_id,
    user.id,
    'share_created',
    'shared_artifact',
    artifact.id,
    null,
    stateHash,
    { record_version_id: recordVersionId, expires_at: expiresAt.toISOString() }
  )

  return NextResponse.json({
    success: true,
    share_url: `/share/${recordVersionId}?token=${rawToken}`,
    expires_at: expiresAt.toISOString(),
    shared_artifact_id: artifact.id,
  })
}
