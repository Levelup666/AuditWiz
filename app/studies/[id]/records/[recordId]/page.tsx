import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import RecordVersionHistory from '@/components/records/record-version-history'
import RecordAuditTrail from '@/components/records/record-audit-trail'
import RecordSignatures from '@/components/records/record-signatures'
import AmendRecordButton from '@/components/records/amend-record-button'
import SignRecordButton from '@/components/records/sign-record-button'
import ShareRecordButton from '@/components/records/share-record-button'
import { canCreateRecord, canApproveRecord, canReviewRecord, canShareRecord, canManageStudyMembers } from '@/lib/supabase/permissions'
import DeleteRecordButton from '@/components/records/delete-record-button'
import RecordStatusActions from '@/components/records/record-status-actions'
import RecordDocuments from '@/components/records/record-documents'
import RecordAIActions from '@/components/records/record-ai-actions'
import AnchorRecordButton from '@/components/records/anchor-record-button'
import OrcidBadge from '@/components/profile/orcid-badge'
import RecordCreatedBanner from '@/components/records/record-created-banner'
import RecordDraftForm from '@/components/records/record-draft-form'
import RecordContentSummary from '@/components/records/record-content-summary'

interface RecordPageProps {
  params: Promise<{ id: string; recordId: string }>
  searchParams: Promise<{ created?: string }>
}

export default async function RecordPage({ params, searchParams }: RecordPageProps) {
  const { id, recordId } = await params
  const sp = await searchParams
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return null
  }

  // Fetch record
  const { data: record, error } = await supabase
    .from('records')
    .select('*')
    .eq('id', recordId)
    .single()

  if (error || !record) {
    notFound()
  }

  const { data: study } = await supabase
    .from('studies')
    .select('metadata')
    .eq('id', id)
    .single()
  const aiEnabled = (study?.metadata as Record<string, unknown>)?.ai_enabled !== false

  // Check permissions
  const canAmend = await canCreateRecord(user.id, id)
  const canSign = await canApproveRecord(user.id, id)
  const canReject = await canReviewRecord(user.id, id) || canSign
  const canShare = await canShareRecord(user.id, id)
  const canDelete = await canManageStudyMembers(user.id, id)

  const { data: creatorProfile } = await supabase
    .from('profiles')
    .select('orcid_id, orcid_verified, display_name')
    .eq('id', record.created_by)
    .maybeSingle()

  const { data: lastEditorProfile } = record.last_edited_by
    ? await supabase
        .from('profiles')
        .select('display_name')
        .eq('id', record.last_edited_by)
        .maybeSingle()
    : { data: null }

  const isDraftEditable = record.status === 'draft' && canAmend

  return (
    <div className="space-y-6">
      <RecordCreatedBanner show={sp?.created === '1'} />
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">
            Record {record.record_number} (Version {record.version})
          </h1>
          <p className="mt-2 text-sm text-gray-500 flex items-center gap-2 flex-wrap">
            <span>Created: {new Date(record.created_at).toLocaleString()}</span>
            {creatorProfile && (creatorProfile.orcid_id || creatorProfile.display_name) && (
              <span className="inline-flex items-center gap-1">
                {creatorProfile.display_name || 'Contributor'}
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
          {record.amendment_reason && (
            <p className="mt-1 text-sm text-gray-600">
              <strong>Amendment Reason:</strong> {record.amendment_reason}
            </p>
          )}
          {record.last_edited_at && record.last_edited_by && (
            <p className="mt-1 text-sm text-gray-500">
              Last edited by {lastEditorProfile?.display_name ?? 'a team member'} at{' '}
              {new Date(record.last_edited_at).toLocaleString()}
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {canAmend && record.status !== 'approved' && (
            <AmendRecordButton studyId={id} recordId={record.id} currentContent={record.content} />
          )}
          <RecordStatusActions
            recordId={record.id}
            studyId={id}
            status={record.status}
            canSubmit={canAmend}
            canReject={canReject}
          />
          {canSign && (record.status === 'under_review' || record.status === 'submitted') && (
            <SignRecordButton studyId={id} record={record} />
          )}
          {record.status === 'approved' && (
            <AnchorRecordButton
              recordId={record.id}
              studyId={id}
              recordVersion={record.version}
              canAnchor={canSign}
            />
          )}
          <Button variant="outline" asChild>
            <Link href={`/verify/${record.id}`}>Verify Integrity</Link>
          </Button>
          {canDelete && (record.status === 'draft' || record.status === 'rejected') && (
            <DeleteRecordButton
              recordId={record.id}
              studyId={id}
              recordNumber={record.record_number}
            />
          )}
          {record.status === 'approved' && canShare && (
            <ShareRecordButton recordId={record.id} studyId={id} />
          )}
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Record Content</CardTitle>
            <CardDescription>
              {isDraftEditable
                ? 'Edit and save your draft. Changes are logged with your identity.'
                : 'Current version content'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isDraftEditable ? (
              <>
                <RecordDraftForm
                  key={record.id}
                  studyId={id}
                  recordId={record.id}
                  initialContent={record.content ?? {}}
                />
                <div className="mt-4 pt-4 border-t">
                  <RecordAIActions recordId={record.id} aiEnabled={aiEnabled} />
                </div>
              </>
            ) : (
              <>
                <RecordContentSummary content={(record.content ?? {}) as Record<string, unknown>} />
                <p className="mt-4 text-xs text-gray-500">Content Hash: {record.content_hash}</p>
                <details className="mt-4 rounded-md border border-border bg-muted/30 p-3 text-sm">
                  <summary className="cursor-pointer font-medium text-muted-foreground">Raw JSON</summary>
                  <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap text-xs">
                    {JSON.stringify(record.content, null, 2)}
                  </pre>
                </details>
                <div className="mt-4 pt-4 border-t">
                  <RecordAIActions recordId={record.id} aiEnabled={aiEnabled} />
                </div>
              </>
            )}
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
          <CardDescription>Attachments for this record</CardDescription>
        </CardHeader>
        <CardContent>
          <RecordDocuments recordId={record.id} studyId={id} canUpload={canAmend} />
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
          <CardDescription>Immutable log of all actions on this record</CardDescription>
        </CardHeader>
        <CardContent>
          <RecordAuditTrail recordId={record.id} />
        </CardContent>
      </Card>
    </div>
  )
}
