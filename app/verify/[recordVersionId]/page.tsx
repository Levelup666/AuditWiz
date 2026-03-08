import { createAdminClient } from '@/lib/supabase/admin'
import { generateHash } from '@/lib/crypto'
import { notFound } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

interface VerifyPageProps {
  params: Promise<{ recordVersionId: string }>
}

export default async function VerifyPage({ params }: VerifyPageProps) {
  const { recordVersionId } = await params

  const supabase = createAdminClient()
  const { data: record, error } = await supabase
    .from('records')
    .select('id, study_id, record_number, version, content, content_hash, status, created_at')
    .eq('id', recordVersionId)
    .single()

  if (error || !record) {
    notFound()
  }

  const computedHash = await generateHash(record.content)
  const contentMatch = computedHash === record.content_hash

  const { data: anchor } = await supabase
    .from('blockchain_anchors')
    .select('content_hash, transaction_hash, block_number, anchored_at')
    .eq('record_id', record.id)
    .eq('record_version', record.version)
    .maybeSingle()

  const anchorFound = Boolean(anchor)
  const anchorHashMatch = anchor ? anchor.content_hash === record.content_hash : false
  const verified = contentMatch && (!anchorFound || anchorHashMatch)

  return (
    <div className="container max-w-2xl py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Integrity Verification</h1>
        <p className="text-gray-600 mt-1">
          Record {record.record_number} (Version {record.version})
        </p>
      </div>

      <Card className={verified ? 'border-green-200 bg-green-50/50' : 'border-amber-200 bg-amber-50/50'}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {verified ? (
              <>
                <span className="text-green-700">Verification passed</span>
                <Badge className="bg-green-600">Verified</Badge>
              </>
            ) : (
              <>
                <span className="text-amber-800">Verification incomplete or mismatch</span>
                <Badge variant="secondary">Check details</Badge>
              </>
            )}
          </CardTitle>
          <CardDescription>
            Content re-hashed and compared to stored hash; blockchain anchor checked when present.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600">Content hash match</span>
              <span className={contentMatch ? 'text-green-600 font-medium' : 'text-red-600 font-medium'}>
                {contentMatch ? 'Yes' : 'No'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Stored hash</span>
              <code className="text-xs truncate max-w-[200px]" title={record.content_hash}>
                {record.content_hash.slice(0, 16)}…
              </code>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Computed hash</span>
              <code className="text-xs truncate max-w-[200px]" title={computedHash}>
                {computedHash.slice(0, 16)}…
              </code>
            </div>
            <hr />
            <div className="flex justify-between">
              <span className="text-gray-600">Blockchain anchor</span>
              <span className={anchorFound ? 'text-green-600' : 'text-gray-500'}>
                {anchorFound ? 'Present' : 'Not anchored'}
              </span>
            </div>
            {anchorFound && (
              <>
                <div className="flex justify-between">
                  <span className="text-gray-600">Anchor hash match</span>
                  <span className={anchorHashMatch ? 'text-green-600 font-medium' : 'text-red-600 font-medium'}>
                    {anchorHashMatch ? 'Yes' : 'No'}
                  </span>
                </div>
                {anchor?.transaction_hash && (
                  <div className="flex justify-between gap-2">
                    <span className="text-gray-600">Transaction</span>
                    <code className="text-xs truncate max-w-[180px]" title={anchor.transaction_hash}>
                      {anchor.transaction_hash.slice(0, 18)}…
                    </code>
                  </div>
                )}
                {anchor?.anchored_at && (
                  <div className="flex justify-between">
                    <span className="text-gray-600">Anchored at</span>
                    <span className="text-gray-700">
                      {new Date(anchor.anchored_at).toLocaleString()}
                    </span>
                  </div>
                )}
              </>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Record metadata</CardTitle>
          <CardDescription>This page does not modify the record.</CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-gray-600">
          <p>Status: {record.status}</p>
          <p>Created: {new Date(record.created_at).toLocaleString()}</p>
        </CardContent>
      </Card>
    </div>
  )
}
