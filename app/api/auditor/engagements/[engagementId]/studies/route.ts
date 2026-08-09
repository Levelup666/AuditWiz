import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getOwnedActiveEngagement } from '@/lib/auditor/assert-engagement-access'

/** Read-only: studies in scope for this engagement. */
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

  if (engagement.scope === 'specific_studies') {
    const { data: links, error } = await supabase
      .from('audit_engagement_studies')
      .select('study_id, study:studies(id, title, status)')
      .eq('engagement_id', engagementId)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const studies = (links ?? []).map((row) => {
      const raw = row.study as
        | { id: string; title: string; status: string }
        | { id: string; title: string; status: string }[]
        | null
      const study = Array.isArray(raw) ? raw[0] ?? null : raw
      return {
        id: study?.id ?? row.study_id,
        title: study?.title ?? null,
        status: study?.status ?? null,
      }
    })

    return NextResponse.json({ engagement_id: engagementId, scope: engagement.scope, studies })
  }

  const { data: studies, error } = await supabase
    .from('studies')
    .select('id, title, status')
    .eq('institution_id', engagement.institution_id)
    .order('title', { ascending: true })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({
    engagement_id: engagementId,
    scope: engagement.scope,
    studies: studies ?? [],
  })
}
