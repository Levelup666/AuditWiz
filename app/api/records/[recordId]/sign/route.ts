import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { canApproveRecord, canReviewRecord } from '@/lib/supabase/permissions'

const VALID_INTENTS = ['review', 'approval', 'amendment', 'rejection'] as const

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
  const {
    intent,
    signature_hash,
    ip_address,
    user_agent,
  } = body as {
    intent?: string
    signature_hash?: string
    ip_address?: string | null
    user_agent?: string | null
  }

  if (!intent || !VALID_INTENTS.includes(intent as (typeof VALID_INTENTS)[number])) {
    return NextResponse.json(
      { error: `intent must be one of: ${VALID_INTENTS.join(', ')}` },
      { status: 400 }
    )
  }
  if (!signature_hash || typeof signature_hash !== 'string') {
    return NextResponse.json({ error: 'signature_hash is required' }, { status: 400 })
  }

  const { data: record, error: recordError } = await supabase
    .from('records')
    .select('id, study_id, record_number, version, status')
    .eq('id', recordId)
    .single()

  if (recordError || !record) {
    return NextResponse.json({ error: 'Record not found' }, { status: 404 })
  }

  const canApproveByRole = await canApproveRecord(user.id, record.study_id)
  const { data: study } = await supabase
    .from('studies')
    .select('created_by, allow_creator_approval, required_approval_count, require_review_before_approval')
    .eq('id', record.study_id)
    .single()
  const canApprove =
    canApproveByRole ||
    (study?.created_by === user.id && study?.allow_creator_approval)
  const canReview = await canReviewRecord(user.id, record.study_id)
  if (intent === 'approval' && !canApprove) {
    return NextResponse.json(
      { error: 'You do not have permission to approve this record' },
      { status: 403 }
    )
  }
  if (intent !== 'approval' && !canReview) {
    return NextResponse.json(
      { error: 'You do not have permission to sign this record' },
      { status: 403 }
    )
  }

  if (intent === 'approval' && study?.require_review_before_approval) {
    if (record.status !== 'under_review' && record.status !== 'submitted') {
      return NextResponse.json(
        { error: 'Record must be under review or submitted before it can be approved' },
        { status: 400 }
      )
    }
  }

  const { error: insertError } = await supabase.from('signatures').insert({
    record_id: record.id,
    record_version: record.version,
    signer_id: user.id,
    intent,
    signature_hash: signature_hash,
    ip_address: ip_address ?? null,
    user_agent: user_agent ?? null,
  })

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 })
  }

  if (intent === 'approval' && study) {
    const required = Math.max(1, study.required_approval_count ?? 1)
    const { count, error: countError } = await supabase
      .from('signatures')
      .select('*', { count: 'exact', head: true })
      .eq('record_id', record.id)
      .eq('record_version', record.version)
      .eq('intent', 'approval')

    if (!countError && count != null && count >= required) {
      await supabase
        .from('records')
        .update({ status: 'approved' })
        .eq('id', record.id)
    }
  }

  return NextResponse.json({ success: true })
}
