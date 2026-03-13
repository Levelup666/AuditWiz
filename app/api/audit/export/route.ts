import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAuditEventsForExport } from '@/lib/supabase/audit'
import { getStudyMemberPermissions } from '@/lib/supabase/permissions'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const studyId = searchParams.get('studyId') || undefined
  const from = searchParams.get('from') || undefined
  const to = searchParams.get('to') || undefined
  const format = searchParams.get('format') || 'json'
  const limit = Math.min(Number(searchParams.get('limit')) || 5000, 10000)

  // When studyId is provided, verify user is a member with view access
  if (studyId) {
    const perms = await getStudyMemberPermissions(user.id, studyId)
    if (!perms?.can_view) {
      return NextResponse.json(
        { error: 'You do not have access to export audit events for this study' },
        { status: 403 }
      )
    }
  }

  const events = await getAuditEventsForExport(studyId, from, to, limit)

  if (format === 'csv') {
    const headers = [
      'id',
      'event_id',
      'study_id',
      'actor_id',
      'actor_role_at_time',
      'action_type',
      'target_entity_type',
      'target_entity_id',
      'previous_state_hash',
      'new_state_hash',
      'timestamp',
      'metadata',
    ]
    const escape = (v: unknown) => {
      const s = v === null || v === undefined ? '' : String(v)
      return `"${s.replace(/"/g, '""')}"`
    }
    const rows = events.map((e: Record<string, unknown>) =>
      headers.map((h) => escape(e[h])).join(',')
    )
    const csv = [headers.join(','), ...rows].join('\n')
    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="audit-export-${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    })
  }

  return NextResponse.json(events)
}
