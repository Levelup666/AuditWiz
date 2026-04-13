import { AuditEventRow, type AuditEventDisplayContext } from './audit-event-row'

interface AuditEventTimelineProps {
  events: Record<string, unknown>[]
  actorEmails: Record<string, string>
  context: AuditEventDisplayContext
}

export function AuditEventTimeline({
  events,
  actorEmails,
  context,
}: AuditEventTimelineProps) {
  if (!events.length) {
    return (
      <div className="py-6 text-center text-sm text-muted-foreground">
        No audit events in this view.
      </div>
    )
  }

  return (
    <div className="relative">
      <div
        className="absolute left-4 top-8 bottom-8 w-px bg-border"
        aria-hidden
      />
      <div className="space-y-0">
        {events.map((event) => (
          <AuditEventRow
            key={String(event.id)}
            event={event}
            actorEmails={actorEmails}
            context={context}
          />
        ))}
      </div>
    </div>
  )
}
