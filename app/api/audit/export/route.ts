import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAuditEventsForExport } from '@/lib/supabase/audit'
import { getActorEmailsForAudit } from '@/lib/audit/get-actor-emails'
import { auditEventTargetLabel } from '@/lib/audit/public-ids'
import {
  canAuditRecord,
  getStudyIdsWhereUserCanAudit,
} from '@/lib/supabase/permissions'
import { SYSTEM_ACTOR_ID } from '@/lib/types'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const auditStudyIds = await getStudyIdsWhereUserCanAudit(user.id)
  if (auditStudyIds.length === 0) {
    return NextResponse.json(
      { error: 'You do not have access to export audit events' },
      { status: 403 }
    )
  }

  const { searchParams } = new URL(request.url)
  const studyId = searchParams.get('studyId') || undefined
  const from = searchParams.get('from') || undefined
  const to = searchParams.get('to') || undefined
  const format = searchParams.get('format') || 'json'
  const limit = Math.min(Number(searchParams.get('limit')) || 5000, 10000)

  if (studyId) {
    if (!auditStudyIds.includes(studyId)) {
      return NextResponse.json(
        { error: 'You do not have access to export audit events for this study' },
        { status: 403 }
      )
    }
    const ok = await canAuditRecord(user.id, studyId)
    if (!ok) {
      return NextResponse.json(
        { error: 'You do not have access to export audit events for this study' },
        { status: 403 }
      )
    }
  }

  const events = await getAuditEventsForExport(
    studyId,
    from,
    to,
    limit,
    studyId ? null : auditStudyIds
  )

  if (format === 'csv') {
    const actorIds = [
      ...new Set(
        events
          .map((e: Record<string, unknown>) => e.actor_id as string | null)
          .filter((id): id is string => !!id && id !== SYSTEM_ACTOR_ID)
      ),
    ]
    const actorEmails = await getActorEmailsForAudit(actorIds)
    const headers = [
      'event_id',
      'timestamp',
      'action_type',
      'actor_email',
      'actor_role_at_time',
      'target_entity_type',
      'target_label',
      'previous_state_hash',
      'new_state_hash',
      'metadata',
    ]
    const escape = (v: unknown) => {
      const s = v === null || v === undefined ? '' : String(v)
      return `"${s.replace(/"/g, '""')}"`
    }
    const rows = events.map((e: Record<string, unknown>) => {
      const actorId = e.actor_id as string | null
      const values: Record<string, unknown> = {
        event_id: e.event_id,
        timestamp: e.timestamp,
        action_type: e.action_type,
        actor_email:
          actorId && actorId !== SYSTEM_ACTOR_ID
            ? actorEmails[actorId] ?? ''
            : '',
        actor_role_at_time: e.actor_role_at_time,
        target_entity_type: e.target_entity_type,
        target_label: auditEventTargetLabel(e),
        previous_state_hash: e.previous_state_hash,
        new_state_hash: e.new_state_hash,
        metadata:
          e.metadata == null ? '' : JSON.stringify(e.metadata),
      }
      return headers.map((h) => escape(values[h])).join(',')
    })
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
