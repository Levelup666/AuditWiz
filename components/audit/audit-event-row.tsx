import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { ACTION_BADGE_STYLES, formatActionType, isSystemAuditActor } from '@/lib/audit-trail'

export type AuditEventDisplayContext =
  | { kind: 'record' }
  | { kind: 'study'; studyId: string }
  | { kind: 'hub'; studyTitles: Record<string, string> }

interface AuditEventRowProps {
  event: Record<string, unknown>
  actorEmails: Record<string, string>
  context: AuditEventDisplayContext
}

export function AuditEventRow({ event, actorEmails, context }: AuditEventRowProps) {
  const actorId = event.actor_id as string | null
  const actionType = String(event.action_type)
  const meta = event.metadata as Record<string, unknown> | undefined
  const system = isSystemAuditActor({
    actor_id: actorId,
    action_type: actionType,
    metadata: event.metadata,
  })

  const studyLink =
    context.kind === 'hub' && event.study_id
      ? context.studyTitles[String(event.study_id)]
      : null

  return (
    <div className="relative flex gap-4 pb-6 last:pb-0">
      <div
        className="relative z-10 mt-1.5 flex h-3 w-3 shrink-0 rounded-full border-2 border-background bg-primary"
        aria-hidden
      />
      <div className="min-w-0 flex-1 rounded-lg border border-gray-200 p-4 transition-colors hover:bg-gray-50">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <Badge
              className={
                ACTION_BADGE_STYLES[actionType] ?? 'bg-gray-100 text-gray-800'
              }
            >
              {formatActionType(actionType)}
            </Badge>
            <span className="text-sm text-gray-600">
              {new Date(String(event.timestamp)).toLocaleString()}
            </span>
            {studyLink ? (
              <Link
                href={`/studies/${String(event.study_id)}`}
                className="text-xs text-primary hover:underline"
              >
                {studyLink}
              </Link>
            ) : null}
            {context.kind === 'study' &&
            event.target_entity_type === 'record' &&
            event.target_entity_id ? (
              <Link
                href={`/studies/${context.studyId}/records/${String(event.target_entity_id)}`}
                className="text-xs text-primary hover:underline"
              >
                Record {String(event.target_entity_id).slice(0, 8)}…
              </Link>
            ) : null}
          </div>
          {system ? (
            <Badge variant="outline" className="bg-orange-50 w-fit">
              System Action
            </Badge>
          ) : null}
        </div>
        <div className="mt-2 space-y-1 text-sm">
          {context.kind === 'hub' ? (
            <p>
              <strong>Target:</strong> {String(event.target_entity_type)}
              {event.target_entity_id ? (
                <span className="text-muted-foreground">
                  {' '}
                  ({String(event.target_entity_id).slice(0, 8)}…)
                </span>
              ) : null}
            </p>
          ) : null}
          {actorId && !system ? (
            <p>
              <strong>Actor:</strong>{' '}
              {actorEmails[actorId] ?? String(actorId).slice(0, 8) + '…'}
              {event.actor_role_at_time
                ? ` (${String(event.actor_role_at_time)})`
                : ''}
            </p>
          ) : null}
          {system && meta?.model_version ? (
            <p>
              <strong>AI Model:</strong> {String(meta.model_version)}
            </p>
          ) : null}
          {event.metadata && Object.keys(event.metadata as object).length > 0 ? (
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
  )
}
