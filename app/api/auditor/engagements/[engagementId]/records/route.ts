import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getOwnedActiveEngagement } from '@/lib/auditor/assert-engagement-access'

const DEFAULT_LIMIT = 50
const MAX_LIMIT = 200

/** Read-only: records visible under this engagement (optional study_id filter). */
export async function GET(
  request: NextRequest,
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

  const studyId = request.nextUrl.searchParams.get('study_id')
  const limitRaw = Number(request.nextUrl.searchParams.get('limit') ?? DEFAULT_LIMIT)
  const limit = Math.min(
    MAX_LIMIT,
    Math.max(1, Number.isFinite(limitRaw) ? Math.floor(limitRaw) : DEFAULT_LIMIT)
  )
  const offsetRaw = Number(request.nextUrl.searchParams.get('offset') ?? 0)
  const offset = Math.max(0, Number.isFinite(offsetRaw) ? Math.floor(offsetRaw) : 0)

  let studyIds: string[] = []
  if (engagement.scope === 'specific_studies') {
    const { data: links } = await supabase
      .from('audit_engagement_studies')
      .select('study_id')
      .eq('engagement_id', engagementId)
    studyIds = (links ?? []).map((l) => l.study_id)
  } else {
    const { data: studies } = await supabase
      .from('studies')
      .select('id')
      .eq('institution_id', engagement.institution_id)
    studyIds = (studies ?? []).map((s) => s.id)
  }

  if (studyId) {
    if (!studyIds.includes(studyId)) {
      return NextResponse.json(
        { error: 'study_id is not in scope for this engagement' },
        { status: 403 }
      )
    }
    studyIds = [studyId]
  }

  if (studyIds.length === 0) {
    return NextResponse.json({
      engagement_id: engagementId,
      records: [],
      limit,
      offset,
      read_only: true,
    })
  }

  const { data: records, error } = await supabase
    .from('records')
    .select('id, study_id, record_number, status, version, created_at, content_hash')
    .in('study_id', studyIds)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({
    engagement_id: engagementId,
    records: records ?? [],
    limit,
    offset,
    read_only: true,
  })
}
