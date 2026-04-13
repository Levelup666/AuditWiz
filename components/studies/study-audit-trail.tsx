import Link from 'next/link'
import { getAllAuditEvents } from '@/lib/supabase/audit'
import { SYSTEM_ACTOR_ID } from '@/lib/types'
import { getActorEmailsForAudit } from '@/lib/audit/get-actor-emails'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { AuditTrailSection } from '@/components/audit/audit-trail-section'
import { AuditEventTimeline } from '@/components/audit/audit-event-timeline'

interface StudyAuditTrailProps {
  studyId: string
  limit?: number
}

export default async function StudyAuditTrail({ studyId, limit = 100 }: StudyAuditTrailProps) {
  const events = await getAllAuditEvents(studyId, limit)

  const actorIds = [
    ...new Set(
      (events ?? [])
        .map((e: { actor_id: string | null }) => e.actor_id)
        .filter((id): id is string => !!id && id !== SYSTEM_ACTOR_ID)
    ),
  ]
  const actorEmails = await getActorEmailsForAudit(actorIds)

  const list = (events ?? []) as Record<string, unknown>[]

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle>Study Audit Trail</CardTitle>
          <CardDescription>
            {list.length > 0
              ? `${list.length} events in view (retention window)`
              : 'No audit events yet'}
          </CardDescription>
        </div>
        <Button variant="outline" size="sm" asChild>
          <Link href={`/logs?studyId=${studyId}`}>Open Logs hub</Link>
        </Button>
      </CardHeader>
      <CardContent>
        {list.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            No audit events yet. Events will appear here as actions are performed.
          </div>
        ) : (
          <AuditTrailSection
            title="Timeline"
            description="Study-scoped events within the retention window."
            eventCount={list.length}
          >
            <AuditEventTimeline
              events={list}
              actorEmails={actorEmails}
              context={{ kind: 'study', studyId }}
            />
          </AuditTrailSection>
        )}
      </CardContent>
    </Card>
  )
}
