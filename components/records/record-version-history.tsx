import { createClient } from '@/lib/supabase/server'
import { Badge } from '@/components/ui/badge'
import Link from 'next/link'

interface RecordVersionHistoryProps {
  recordId: string
}

export default async function RecordVersionHistory({ recordId }: RecordVersionHistoryProps) {
  const supabase = await createClient()
  
  // Fetch all versions by following the version chain
  const { data: versions, error } = await supabase
    .from('records')
    .select('*')
    .or(`id.eq.${recordId},previous_version_id.eq.${recordId}`)
    .order('version', { ascending: true })

  if (error || !versions || versions.length === 0) {
    return <div className="text-sm text-gray-500">No version history available</div>
  }

  // Build full version chain
  const versionMap = new Map(versions.map((v: any) => [v.id, v]))
  const currentVersion = versions.find((v: any) => v.id === recordId)
  
  // Traverse backwards to build chain
  const chain: any[] = []
  let current = currentVersion
  while (current) {
    chain.unshift(current)
    current = current.previous_version_id ? versionMap.get(current.previous_version_id) : null
  }

  return (
    <div className="space-y-4">
      {chain.map((version, index) => (
        <div
          key={version.id}
          className={`p-4 border rounded-lg ${
            version.id === recordId ? 'border-primary bg-primary/5' : 'border-gray-200'
          }`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Badge variant={version.id === recordId ? 'default' : 'outline'}>
                Version {version.version}
              </Badge>
              <span className="text-sm text-gray-600">
                {new Date(version.created_at).toLocaleString()}
              </span>
            </div>
            {version.id !== recordId && (
              <Link
                href={`/studies/${version.study_id}/records/${version.id}`}
                className="text-sm text-primary hover:underline"
              >
                View
              </Link>
            )}
          </div>
          {version.amendment_reason && (
            <p className="mt-2 text-sm text-gray-700">
              <strong>Amendment:</strong> {version.amendment_reason}
            </p>
          )}
          <p className="mt-1 text-xs text-gray-500">
            Status: {version.status} • Hash: {version.content_hash.substring(0, 16)}...
          </p>
        </div>
      ))}
    </div>
  )
}
