import { createClient } from '@/lib/supabase/server'
import { Badge } from '@/components/ui/badge'

interface RecordSignaturesProps {
  recordId: string
  recordVersion: number
}

export default async function RecordSignatures({ recordId, recordVersion }: RecordSignaturesProps) {
  const supabase = await createClient()
  
  const { data: signatures, error } = await supabase
    .from('signatures')
    .select('*, signer:auth.users(email)')
    .eq('record_id', recordId)
    .eq('record_version', recordVersion)
    .order('signed_at', { ascending: false })

  if (error || !signatures || signatures.length === 0) {
    return <div className="text-sm text-gray-500">No signatures for this version</div>
  }

  const getIntentBadge = (intent: string) => {
    const styles = {
      review: 'bg-blue-100 text-blue-800',
      approval: 'bg-green-100 text-green-800',
      amendment: 'bg-purple-100 text-purple-800',
      rejection: 'bg-red-100 text-red-800',
    }
    return (
      <Badge className={styles[intent as keyof typeof styles] || 'bg-gray-100 text-gray-800'}>
        {intent}
      </Badge>
    )
  }

  return (
    <div className="space-y-4">
      {signatures.map((sig: any) => (
        <div key={sig.id} className="p-4 border border-gray-200 rounded-lg">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              {getIntentBadge(sig.intent)}
              <span className="text-sm font-medium">
                {sig.signer?.email || 'Unknown'}
              </span>
            </div>
            <span className="text-xs text-gray-500">
              {new Date(sig.signed_at).toLocaleString()}
            </span>
          </div>
          <p className="text-xs text-gray-500 font-mono">
            Signature Hash: {sig.signature_hash.substring(0, 32)}...
          </p>
          {sig.ip_address && (
            <p className="text-xs text-gray-500 mt-1">
              IP: {sig.ip_address}
            </p>
          )}
        </div>
      ))}
    </div>
  )
}
