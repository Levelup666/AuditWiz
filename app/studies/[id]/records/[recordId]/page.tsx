import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import RecordVersionHistory from '@/components/records/record-version-history'
import RecordAuditTrail from '@/components/records/record-audit-trail'
import RecordSignatures from '@/components/records/record-signatures'
import AmendRecordButton from '@/components/records/amend-record-button'
import SignRecordButton from '@/components/records/sign-record-button'
import { canCreateRecord, canApproveRecord, canReviewRecord } from '@/lib/supabase/permissions'
import RecordStatusActions from '@/components/records/record-status-actions'
import RecordDocuments from '@/components/records/record-documents'
import AnchorRecordButton from '@/components/records/anchor-record-button'

interface RecordPageProps {
  params: Promise<{ id: string; recordId: string }>
}

export default async function RecordPage({ params }: RecordPageProps) {
  const { id, recordId } = await params
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

  // Check permissions
  const canAmend = await canCreateRecord(user.id, id)
  const canSign = await canApproveRecord(user.id, id)
  const canReject = await canReviewRecord(user.id, id) || canSign

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">
            Record {record.record_number} (Version {record.version})
          </h1>
          <p className="mt-2 text-sm text-gray-500">
            Created: {new Date(record.created_at).toLocaleString()}
          </p>
          {record.amendment_reason && (
            <p className="mt-1 text-sm text-gray-600">
              <strong>Amendment Reason:</strong> {record.amendment_reason}
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
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Record Content</CardTitle>
            <CardDescription>Current version content</CardDescription>
          </CardHeader>
          <CardContent>
            <pre className="whitespace-pre-wrap text-sm bg-gray-50 p-4 rounded">
              {JSON.stringify(record.content, null, 2)}
            </pre>
            <p className="mt-4 text-xs text-gray-500">
              Content Hash: {record.content_hash}
            </p>
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
