import { getAuditTrail } from '@/lib/supabase/audit'
import { SYSTEM_ACTOR_ID } from '@/lib/types'
import { getActorEmailsForAudit } from '@/lib/audit/get-actor-emails'
import { AuditTrailSection } from '@/components/audit/audit-trail-section'
import { AuditEventTimeline } from '@/components/audit/audit-event-timeline'

interface RecordAuditTrailProps {
  recordId: string
}

export default async function RecordAuditTrail({ recordId }: RecordAuditTrailProps) {
  const events = await getAuditTrail('record', recordId, 50)

  if (!events || events.length === 0) {
    return <div className="text-sm text-gray-500">No audit events yet</div>
  }

  const actorIds = [
    ...new Set(
      events
        .map((e: { actor_id: string | null }) => e.actor_id)
        .filter((id): id is string => !!id && id !== SYSTEM_ACTOR_ID)
    ),
  ]
  const actorEmails = await getActorEmailsForAudit(actorIds)

  return (
    <AuditTrailSection
      title="Audit activity"
      description="Immutable log within the retention window. Open to view the timeline."
      eventCount={events.length}
    >
      <AuditEventTimeline
        events={events as Record<string, unknown>[]}
        actorEmails={actorEmails}
        context={{ kind: 'record' }}
      />
    </AuditTrailSection>
  )
}
