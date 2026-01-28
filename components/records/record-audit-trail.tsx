import { getAuditTrail } from '@/lib/supabase/audit'
import { Badge } from '@/components/ui/badge'
import { SYSTEM_ACTOR_ID } from '@/lib/types'

interface RecordAuditTrailProps {
  recordId: string
}

export default async function RecordAuditTrail({ recordId }: RecordAuditTrailProps) {
  const events = await getAuditTrail('record', recordId, 50)

  if (!events || events.length === 0) {
    return <div className="text-sm text-gray-500">No audit events yet</div>
  }

  const getActionBadge = (actionType: string) => {
    const styles: Record<string, string> = {
      record_created: 'bg-blue-100 text-blue-800',
      record_amended: 'bg-purple-100 text-purple-800',
      record_submitted: 'bg-yellow-100 text-yellow-800',
      signature_added: 'bg-green-100 text-green-800',
      ai_action: 'bg-orange-100 text-orange-800',
      system_action: 'bg-gray-100 text-gray-800',
    }
    return (
      <Badge className={styles[actionType] || 'bg-gray-100 text-gray-800'}>
        {actionType.replace('_', ' ')}
      </Badge>
    )
  }

  return (
    <div className="space-y-4">
      {events.map((event: any) => (
        <div key={event.id} className="p-4 border border-gray-200 rounded-lg">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              {getActionBadge(event.action_type)}
              <span className="text-sm text-gray-600">
                {new Date(event.timestamp).toLocaleString()}
              </span>
            </div>
            {event.actor_id === SYSTEM_ACTOR_ID && (
              <Badge variant="outline" className="bg-orange-50">
                System Action
              </Badge>
            )}
          </div>
          <div className="text-sm space-y-1">
            {event.actor_id && event.actor_id !== SYSTEM_ACTOR_ID && (
              <p>
                <strong>Actor:</strong> {event.actor_id}
                {event.actor_role_at_time && ` (${event.actor_role_at_time})`}
              </p>
            )}
            {event.actor_id === SYSTEM_ACTOR_ID && event.metadata?.model_version && (
              <p>
                <strong>AI Model:</strong> {event.metadata.model_version}
              </p>
            )}
            {event.metadata && Object.keys(event.metadata).length > 0 && (
              <details className="mt-2">
                <summary className="cursor-pointer text-xs text-gray-500">View Metadata</summary>
                <pre className="mt-2 text-xs bg-gray-50 p-2 rounded">
                  {JSON.stringify(event.metadata, null, 2)}
                </pre>
              </details>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
