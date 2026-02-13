import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

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

  const { data: record } = await supabase
    .from('records')
    .select('version')
    .eq('id', recordId)
    .single()

  if (!record) {
    return NextResponse.json({ error: 'Record not found' }, { status: 404 })
  }

  const { data: anchor } = await supabase
    .from('blockchain_anchors')
    .select('id, transaction_hash, block_number')
    .eq('record_id', recordId)
    .eq('record_version', record.version)
    .maybeSingle()

  return NextResponse.json({ anchor: anchor ?? null })
}
