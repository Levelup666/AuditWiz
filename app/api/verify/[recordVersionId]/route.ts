import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { generateHash } from '@/lib/crypto'

/**
 * GET: Integrity verification for a record version.
 * Re-hashes record content, compares to stored hash, checks blockchain anchor.
 * Does not modify any record data.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ recordVersionId: string }> }
) {
  const { recordVersionId } = await params

  if (!recordVersionId) {
    return NextResponse.json({ error: 'recordVersionId required' }, { status: 400 })
  }

  const supabase = createAdminClient()
  const { data: record, error: recError } = await supabase
    .from('records')
    .select('id, study_id, record_number, version, content, content_hash, status, created_at')
    .eq('id', recordVersionId)
    .single()

  if (recError || !record) {
    return NextResponse.json({ error: 'Record not found' }, { status: 404 })
  }

  const computedHash = await generateHash(record.content)
  const contentMatch = computedHash === record.content_hash

  const { data: anchor } = await supabase
    .from('blockchain_anchors')
    .select('id, content_hash, transaction_hash, block_number, anchored_at')
    .eq('record_id', record.id)
    .eq('record_version', record.version)
    .maybeSingle()

  const anchorFound = Boolean(anchor)
  const anchorHashMatch = anchor ? anchor.content_hash === record.content_hash : false

  return NextResponse.json({
    record_version_id: record.id,
    record_number: record.record_number,
    version: record.version,
    status: record.status,
    created_at: record.created_at,
    verification: {
      content_hash_stored: record.content_hash,
      content_hash_computed: computedHash,
      content_match: contentMatch,
      anchor_found: anchorFound,
      anchor_hash_match: anchorHashMatch,
      anchor: anchor
        ? {
            transaction_hash: anchor.transaction_hash,
            block_number: anchor.block_number,
            anchored_at: anchor.anchored_at,
          }
        : null,
    },
    verified: contentMatch && (!anchorFound || anchorHashMatch),
  })
}
