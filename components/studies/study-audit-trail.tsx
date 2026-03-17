import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase/admin'
import { getAllAuditEvents } from '@/lib/supabase/audit'
import { SYSTEM_ACTOR_ID } from '@/lib/types'
import { ACTION_BADGE_STYLES, formatActionType } from '@/lib/audit-trail'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

async function getActorEmails(actorIds: string[]): Promise<Record<string, string>> {
  const admin = createAdminClient()
  const emails: Record<string, string> = {}
  await Promise.all(
    actorIds.map(async (id) => {
      try {
        const { data } = await admin.auth.admin.getUserById(id)
        emails[id] = data.user?.email ?? id.slice(0, 8) + '…'
      } catch {
        emails[id] = id.slice(0, 8) + '…'
      }
    })
  )
  return emails
}

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
  const actorEmails = await getActorEmails(actorIds)

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle>Study Audit Trail</CardTitle>
          <CardDescription>
            {events && events.length > 0
              ? `${events.length} events`
              : 'No audit events yet'}
          </CardDescription>
        </div>
        <Button variant="outline" size="sm" asChild>
          <Link href={`/dashboard/audit-trail?studyId=${studyId}`}>
            View full audit trail
          </Link>
        </Button>
      </CardHeader>
      <CardContent>
        {!events || events.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            No audit events yet. Events will appear here as actions are performed.
          </div>
        ) : (
          <div className="relative">
            <div
              className="absolute left-4 top-8 bottom-8 w-px bg-border"
              aria-hidden
            />
            <div className="space-y-0">
              {events.map((event: Record<string, unknown>) => (
                <div key={String(event.id)} className="relative flex gap-4 pb-6 last:pb-0">
                  <div
                    className="relative z-10 mt-1.5 flex h-3 w-3 shrink-0 rounded-full border-2 border-background bg-primary"
                    aria-hidden
                  />
                  <div className="min-w-0 flex-1 rounded-lg border border-gray-200 p-4 transition-colors hover:bg-gray-50">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge
                          className={
                            ACTION_BADGE_STYLES[String(event.action_type)] ??
                            'bg-gray-100 text-gray-800'
                          }
                        >
                          {formatActionType(String(event.action_type))}
                        </Badge>
                        <span className="text-sm text-gray-600">
                          {new Date(String(event.timestamp)).toLocaleString()}
                        </span>
                        {event.target_entity_type === 'record' && event.target_entity_id ? (
                          <Link
                            href={`/studies/${studyId}/records/${event.target_entity_id}`}
                            className="text-xs text-primary hover:underline"
                          >
                            Record {String(event.target_entity_id).slice(0, 8)}…
                          </Link>
                        ) : null}
                      </div>
                      {event.actor_id === SYSTEM_ACTOR_ID && (
                        <Badge variant="outline" className="bg-orange-50 w-fit">
                          System Action
                        </Badge>
                      )}
                    </div>
                    <div className="mt-2 space-y-1 text-sm">
                      {event.actor_id && event.actor_id !== SYSTEM_ACTOR_ID ? (
                        <p>
                          <strong>Actor:</strong>{' '}
                          {actorEmails[String(event.actor_id)] ??
                            String(event.actor_id).slice(0, 8) + '…'}
                          {event.actor_role_at_time
                            ? ` (${event.actor_role_at_time})`
                            : ''}
                        </p>
                      ) : null}
                      {event.actor_id === SYSTEM_ACTOR_ID &&
                      (event.metadata as Record<string, unknown>)?.model_version ? (
                        <p>
                          <strong>AI Model:</strong>{' '}
                          {String(
                            (event.metadata as Record<string, unknown>).model_version
                          )}
                        </p>
                      ) : null}
                      {event.metadata &&
                      Object.keys(event.metadata as object).length > 0 ? (
                        <details className="mt-2">
                          <summary className="cursor-pointer text-xs text-gray-500 hover:text-gray-700">
                            View Metadata
                          </summary>
                          <pre className="mt-2 overflow-auto rounded bg-gray-50 p-2 text-xs">
                            {JSON.stringify(event.metadata as object, null, 2)}
                          </pre>
                        </details>
                      ) : null}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
