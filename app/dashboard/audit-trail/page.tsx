import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { getAllAuditEvents } from '@/lib/supabase/audit'
import { SYSTEM_ACTOR_ID } from '@/lib/types'

export default async function AuditTrailPage({
  searchParams,
}: {
  searchParams: Promise<{ studyId?: string }>
}) {
  const params = await searchParams
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/auth/signin')
  }

  const events = await getAllAuditEvents(params.studyId || null, 200)

  const getActionBadge = (actionType: string) => {
    const styles: Record<string, string> = {
      study_created: 'bg-blue-100 text-blue-800',
      study_updated: 'bg-blue-100 text-blue-800',
      study_deleted: 'bg-red-100 text-red-800',
      member_added: 'bg-green-100 text-green-800',
      member_removed: 'bg-red-100 text-red-800',
      member_role_changed: 'bg-yellow-100 text-yellow-800',
      record_created: 'bg-blue-100 text-blue-800',
      record_amended: 'bg-purple-100 text-purple-800',
      record_submitted: 'bg-yellow-100 text-yellow-800',
      record_rejected: 'bg-red-100 text-red-800',
      signature_added: 'bg-green-100 text-green-800',
      signature_revoked: 'bg-red-100 text-red-800',
      ai_action: 'bg-orange-100 text-orange-800',
      system_action: 'bg-gray-100 text-gray-800',
      blockchain_anchored: 'bg-indigo-100 text-indigo-800',
    }
    return (
      <Badge className={styles[actionType] || 'bg-gray-100 text-gray-800'}>
        {actionType.replace(/_/g, ' ')}
      </Badge>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Audit Trail</h1>
        <p className="mt-2 text-gray-600">
          Complete history of all actions and events in the system
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All Audit Events</CardTitle>
          <CardDescription>
            {events && events.length > 0
              ? `${events.length} events found`
              : 'No audit events found'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!events || events.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              No audit events yet. Events will appear here as actions are performed.
            </div>
          ) : (
            <div className="space-y-4">
              {events.map((event: any) => (
                <div
                  key={event.id}
                  className="p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      {getActionBadge(event.action_type)}
                      <span className="text-sm text-gray-600">
                        {new Date(event.timestamp).toLocaleString()}
                      </span>
                      {event.study_id && (
                        <Badge variant="outline" className="text-xs">
                          Study: {event.study_id.slice(0, 8)}...
                        </Badge>
                      )}
                    </div>
                    {event.actor_id === SYSTEM_ACTOR_ID && (
                      <Badge variant="outline" className="bg-orange-50">
                        System Action
                      </Badge>
                    )}
                  </div>
                  <div className="text-sm space-y-1">
                    <p>
                      <strong>Target:</strong> {event.target_entity_type}
                      {event.target_entity_id && ` (${event.target_entity_id.slice(0, 8)}...)`}
                    </p>
                    {event.actor_id && event.actor_id !== SYSTEM_ACTOR_ID && (
                      <p>
                        <strong>Actor:</strong> {event.actor_id.slice(0, 8)}...
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
                        <summary className="cursor-pointer text-xs text-gray-500 hover:text-gray-700">
                          View Metadata
                        </summary>
                        <pre className="mt-2 text-xs bg-gray-50 p-2 rounded overflow-auto">
                          {JSON.stringify(event.metadata, null, 2)}
                        </pre>
                      </details>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
