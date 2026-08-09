import Link from 'next/link'
import { redirect, notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getOwnedActiveEngagement } from '@/lib/auditor/assert-engagement-access'
import { isAuditorScopedToStudy } from '@/lib/auditor/engagements'
import AuditorAccessBeacon from '@/components/auditor/auditor-access-beacon'
import AuditorEngagementBanner from '@/components/auditor/auditor-engagement-banner'
import RecordVersionHistory from '@/components/records/record-version-history'
import RecordAuditTrail from '@/components/records/record-audit-trail'
import RecordSignatures from '@/components/records/record-signatures'
import RecordDocuments from '@/components/records/record-documents'
import RecordContentSummary from '@/components/records/record-content-summary'
import OrcidBadge from '@/components/profile/orcid-badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { formatMemberListName } from '@/lib/profile/member-display-name'

interface PageProps {
  params: Promise<{ engagementId: string; studyId: string; recordId: string }>
}

export default async function AuditorRecordPage({ params }: PageProps) {
  const { engagementId, studyId, recordId } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    redirect(
      `/auth/signin?redirectedFrom=${encodeURIComponent(`/auditor/engagements/${engagementId}/studies/${studyId}/records/${recordId}`)}`
    )
  }

  const engagement = await getOwnedActiveEngagement(supabase, user.id, engagementId)
  if (!engagement) notFound()

  const inScope = await isAuditorScopedToStudy(user.id, studyId)
  if (!inScope) notFound()

  const { data: record } = await supabase.from('records').select('*').eq('id', recordId).single()
  if (!record || record.study_id !== studyId) notFound()

  const { data: institution } = await supabase
    .from('institutions')
    .select('name')
    .eq('id', engagement.institution_id)
    .maybeSingle()

  const { data: creatorProfile } = await supabase
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
        undefined
      )
    : 'Unknown'

  return (
    <div className="space-y-6">
      <AuditorAccessBeacon
        engagementId={engagementId}
        surface="record"
        studyId={studyId}
        recordId={recordId}
      />
      <AuditorEngagementBanner
        institutionName={institution?.name ?? null}
        scopeLabel="Read-only audit review"
        startsAt={engagement.starts_at}
        expiresAt={engagement.expires_at}
        purpose={engagement.purpose}
        organizationName={engagement.auditor_organization_name}
        auditorTitle={engagement.auditor_title}
        referenceId={engagement.auditor_reference_id}
      />

      <div>
        <p className="text-sm text-muted-foreground">
          <Link
            href={`/auditor/engagements/${engagementId}/studies/${studyId}`}
            className="hover:underline"
          >
            ← Study
          </Link>
        </p>
        <h1 className="mt-2 text-3xl font-bold text-gray-900">
          Record {record.record_number} (Version {record.version})
        </h1>
        <p className="mt-2 flex flex-wrap items-center gap-2 text-sm text-gray-500">
          <span>Created: {new Date(record.created_at).toLocaleString()}</span>
          {creatorProfile && (creatorProfile.orcid_id || creatorListName !== 'Unknown') ? (
            <span className="inline-flex items-center gap-1">
              {creatorListName !== 'Unknown' ? creatorListName : 'Contributor'}
              {creatorProfile.orcid_id ? (
                <OrcidBadge
                  orcidId={creatorProfile.orcid_id}
                  verified={creatorProfile.orcid_verified}
                  showId
                />
              ) : null}
            </span>
          ) : null}
        </p>
        <div className="mt-3">
          <Button variant="outline" asChild>
            <Link href={`/verify/${record.id}`}>Verify Integrity</Link>
          </Button>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Record Content</CardTitle>
            <CardDescription>Read-only current version</CardDescription>
          </CardHeader>
          <CardContent>
            <RecordContentSummary content={(record.content ?? {}) as Record<string, unknown>} />
            <p className="mt-4 text-xs text-gray-500">Content Hash: {record.content_hash}</p>
            <details className="mt-4 rounded-md border border-border bg-muted/30 p-3 text-sm">
              <summary className="cursor-pointer font-medium text-muted-foreground">Raw JSON</summary>
              <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap text-xs">
                {JSON.stringify(record.content, null, 2)}
              </pre>
            </details>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Version History</CardTitle>
            <CardDescription>All versions of this record</CardDescription>
          </CardHeader>
          <CardContent>
            <RecordVersionHistory recordId={record.id} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Documents</CardTitle>
          <CardDescription>Attachments for this record (download only)</CardDescription>
        </CardHeader>
        <CardContent>
          <RecordDocuments recordId={record.id} studyId={studyId} canUpload={false} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Electronic Signatures</CardTitle>
          <CardDescription>Cryptographic signatures for this record version</CardDescription>
        </CardHeader>
        <CardContent>
          <RecordSignatures recordId={record.id} recordVersion={record.version} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Audit Trail</CardTitle>
          <CardDescription>Immutable log of actions on this record</CardDescription>
        </CardHeader>
        <CardContent>
          <RecordAuditTrail recordId={record.id} />
        </CardContent>
      </Card>
    </div>
  )
}
