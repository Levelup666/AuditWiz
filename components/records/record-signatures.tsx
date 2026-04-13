import { createClient } from '@/lib/supabase/server'
import { Badge } from '@/components/ui/badge'
import OrcidBadge from '@/components/profile/orcid-badge'
import { formatMemberListName } from '@/lib/profile/member-display-name'

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

  const signerIds = [...new Set((signatures as any[]).map((s) => s.signer_id))]
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, orcid_id, orcid_verified, first_name, last_name, nickname, display_name')
    .in('id', signerIds)
  const profileByUser = (profiles ?? []).reduce(
    (acc, p) => {
      acc[p.id] = p
      return acc
    },
    {} as Record<
      string,
      {
        id: string
        orcid_id: string | null
        orcid_verified: boolean
        first_name: string | null
        last_name: string | null
        nickname: string | null
        display_name: string | null
      }
    >
  )

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
      {signatures.map((sig: any) => {
        const profile = profileByUser[sig.signer_id]
        const signerEmail = typeof sig.signer?.email === 'string' ? sig.signer.email : ''
        const listName = profile
          ? formatMemberListName(
              {
                nickname: profile.nickname,
                first_name: profile.first_name,
                last_name: profile.last_name,
                display_name: profile.display_name,
              },
              { email: signerEmail, userId: sig.signer_id }
            )
          : signerEmail || 'Unknown'
        return (
        <div key={sig.id} className="p-4 border border-gray-200 rounded-lg">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2 flex-wrap">
              {getIntentBadge(sig.intent)}
              <span className="text-sm font-medium">
                {listName}
                {signerEmail && listName !== signerEmail ? (
                  <span className="text-muted-foreground font-normal"> · {signerEmail}</span>
                ) : null}
              </span>
              {profile?.orcid_id && (
                <OrcidBadge
                  orcidId={profile.orcid_id}
                  verified={profile.orcid_verified}
                  showId
                />
              )}
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
        )
      })}
    </div>
  )
}
