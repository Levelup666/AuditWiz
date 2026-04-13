import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { generateHash } from '@/lib/crypto'
import { createAuditEvent } from '@/lib/supabase/audit'
import { notFound } from 'next/navigation'
import { headers } from 'next/headers'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import RecordSignatures from '@/components/records/record-signatures'
import RecordContentSummary from '@/components/records/record-content-summary'
import OrcidBadge from '@/components/profile/orcid-badge'
import { formatMemberListName } from '@/lib/profile/member-display-name'

interface SharePageProps {
  params: Promise<{ recordVersionId: string }>
  searchParams: Promise<{ token?: string }>
}

export default async function SharePage({ params, searchParams }: SharePageProps) {
  const { recordVersionId } = await params
  const { token } = await searchParams

  if (!token?.trim()) {
    return (
      <div className="container max-w-lg py-12 text-center">
        <p className="text-gray-600">Invalid share link. A valid token is required.</p>
      </div>
    )
  }

  const accessTokenHash = await generateHash(token)
  const supabase = await createClient()

  const { data: artifact, error: artError } = await supabase
    .from('shared_artifacts')
    .select('id, record_version_id, expires_at')
    .eq('record_version_id', recordVersionId)
    .eq('access_token_hash', accessTokenHash)
    .single()

  if (artError || !artifact) {
    notFound()
  }

  if (new Date(artifact.expires_at) <= new Date()) {
    return (
      <div className="container max-w-lg py-12 text-center">
        <p className="text-gray-600">This share link has expired.</p>
      </div>
    )
  }

  const headersList = await headers()
  const ip =
    headersList.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    headersList.get('x-real-ip') ||
    null
  const userAgent = headersList.get('user-agent') || null

  await supabase.rpc('create_share_access_event', {
    p_shared_artifact_id: artifact.id,
    p_ip_address: ip,
    p_user_agent: userAgent,
  })

  const admin = createAdminClient()
  const { data: recordForAudit } = await admin
    .from('records')
    .select('study_id')
    .eq('id', artifact.record_version_id)
    .single()
  const stateHash = await generateHash({
    shared_artifact_id: artifact.id,
    accessed_at: new Date().toISOString(),
    ip,
  })
  await createAuditEvent(
    recordForAudit?.study_id ?? null,
    null,
    'share_accessed',
    'shared_artifact',
    artifact.id,
    null,
    stateHash,
    { ip, user_agent: userAgent }
  )

  const { data: record, error: recError } = await admin
    .from('records')
    .select('id, study_id, record_number, version, status, content, content_hash, created_at, amendment_reason, created_by')
    .eq('id', artifact.record_version_id)
    .single()

  if (recError || !record) {
    notFound()
  }

  const { data: creatorProfile } = await admin
    .from('profiles')
    .select('orcid_id, orcid_verified, first_name, last_name, nickname, display_name')
    .eq('id', record.created_by)
    .maybeSingle()

  const creatorListName = creatorProfile
    ? formatMemberListName(
        {
          nickname: creatorProfile.nickname,
          first_name: creatorProfile.first_name,
          last_name: creatorProfile.last_name,
          display_name: creatorProfile.display_name,
        },
        { userId: record.created_by }
      )
    : 'Unknown'

  const { data: anchor } = await admin
    .from('blockchain_anchors')
    .select('transaction_hash, block_number, anchored_at')
    .eq('record_id', record.id)
    .eq('record_version', record.version)
    .maybeSingle()

  return (
    <div className="container max-w-3xl py-8 space-y-6">
      <div className="rounded-lg border border-amber-200 bg-amber-50/50 px-4 py-2 text-sm text-amber-800">
        Read-only shared record. No editing, re-sharing, or amendment access.
      </div>

      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          Record {record.record_number} (Version {record.version})
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Created: {new Date(record.created_at).toLocaleString()}
          {creatorProfile && (creatorProfile.orcid_id || creatorListName !== 'Unknown') && (
            <span className="ml-2 inline-flex items-center gap-1">
              Contributor:{' '}
              {creatorListName !== 'Unknown' ? creatorListName : 'Unknown'}
              {creatorProfile.orcid_id && (
                <OrcidBadge
                  orcidId={creatorProfile.orcid_id}
                  verified={creatorProfile.orcid_verified}
                  showId
                />
              )}
            </span>
          )}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Record content</CardTitle>
          <CardDescription>Current version (read-only)</CardDescription>
        </CardHeader>
        <CardContent>
          <RecordContentSummary content={(record.content ?? {}) as Record<string, unknown>} />
          <p className="mt-4 text-xs text-gray-500">Content hash: {record.content_hash}</p>
          <details className="mt-4 rounded-md border border-border bg-muted/30 p-3 text-sm">
            <summary className="cursor-pointer font-medium text-muted-foreground">Raw JSON</summary>
            <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap text-xs">
              {JSON.stringify(record.content, null, 2)}
            </pre>
          </details>
        </CardContent>
      </Card>

      {record.amendment_reason && (
        <Card>
          <CardHeader>
            <CardTitle>Amendment reason</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-700">{record.amendment_reason}</p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Electronic signatures</CardTitle>
          <CardDescription>Signatures for this record version</CardDescription>
        </CardHeader>
        <CardContent>
          <RecordSignatures recordId={record.id} recordVersion={record.version} />
        </CardContent>
      </Card>

      {anchor && (
        <Card>
          <CardHeader>
            <CardTitle>Blockchain anchor</CardTitle>
            <CardDescription>This version has been anchored</CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-gray-600 space-y-1">
            {anchor.transaction_hash && (
              <p>Transaction: <code className="text-xs">{anchor.transaction_hash}</code></p>
            )}
            {anchor.anchored_at && (
              <p>Anchored: {new Date(anchor.anchored_at).toLocaleString()}</p>
            )}
          </CardContent>
        </Card>
      )}

      <p className="text-center text-sm text-gray-500">
        <a href={`/verify/${record.id}`} className="text-primary hover:underline">
          Verify integrity of this record
        </a>
      </p>
    </div>
  )
}
