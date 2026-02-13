import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAuditEvent } from '@/lib/supabase/audit'
import { generateHash } from '@/lib/crypto'
import { anchorRecordToBlockchain } from '@/lib/blockchain'
import { canApproveRecord } from '@/lib/supabase/permissions'

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

  if (record.status !== 'approved') {
    return NextResponse.json(
      { error: 'Only approved records can be anchored to the blockchain' },
      { status: 400 }
    )
  }

  const allowed = await canApproveRecord(user.id, record.study_id)
  if (!allowed) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const existing = await supabase
    .from('blockchain_anchors')
    .select('id')
    .eq('record_id', recordId)
    .eq('record_version', record.version)
    .maybeSingle()

  if (existing.data) {
    return NextResponse.json(
      { error: 'This record version is already anchored' },
      { status: 409 }
    )
  }

  const result = await anchorRecordToBlockchain(
    recordId,
    record.version,
    record.content_hash
  )

  const { data: anchor, error: insertError } = await supabase
    .from('blockchain_anchors')
    .insert({
      record_id: recordId,
      record_version: record.version,
      content_hash: record.content_hash,
      transaction_hash: result.transaction_hash,
      block_number: result.block_number,
      metadata: {},
    })
    .select('id')
    .single()

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 })
  }

  const stateHash = await generateHash({
    anchor_id: anchor.id,
    transaction_hash: result.transaction_hash,
    block_number: result.block_number,
  })

  await createAuditEvent(
    record.study_id,
    user.id,
    'blockchain_anchored',
    'blockchain_anchor',
    anchor.id,
    null,
    stateHash,
    {
      record_id: recordId,
      record_version: record.version,
      transaction_hash: result.transaction_hash,
      block_number: result.block_number,
    }
  )

  return NextResponse.json({
    success: true,
    anchor_id: anchor.id,
    transaction_hash: result.transaction_hash,
    block_number: result.block_number,
  })
}
