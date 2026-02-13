'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

interface RecordStatusActionsProps {
  recordId: string
  studyId: string
  status: string
  canSubmit: boolean
  canReject: boolean
}

export default function RecordStatusActions({
  recordId,
  studyId,
  status,
  canSubmit,
  canReject,
}: RecordStatusActionsProps) {
  const router = useRouter()
  const [rejectOpen, setRejectOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const updateStatus = async (newStatus: string, reason?: string) => {
    setError(null)
    setLoading(true)
    try {
      const res = await fetch(`/api/records/${recordId}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus, reason }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || res.statusText)
      setRejectOpen(false)
      setReason('')
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update status')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      {canSubmit && status === 'draft' && (
        <Button
          variant="outline"
          onClick={() => updateStatus('under_review')}
          disabled={loading}
        >
          {loading ? 'Submitting…' : 'Submit for Review'}
        </Button>
      )}
      {canReject && (status === 'under_review' || status === 'submitted') && (
        <>
          <Button variant="outline" onClick={() => setRejectOpen(true)} disabled={loading}>
            Reject
          </Button>
          <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Reject Record</DialogTitle>
                <DialogDescription>
                  This will mark the record as rejected. You can optionally provide a reason (stored in the audit trail).
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                {error && (
                  <div className="rounded-md bg-red-50 p-3">
                    <p className="text-sm text-red-800">{error}</p>
                  </div>
                )}
                <div>
                  <Label htmlFor="reject-reason">Reason (optional)</Label>
                  <Textarea
                    id="reject-reason"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="Reason for rejection..."
                    className="mt-1"
                    rows={3}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setRejectOpen(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={() => updateStatus('rejected', reason.trim() || undefined)}
                  disabled={loading}
                >
                  {loading ? 'Rejecting…' : 'Reject Record'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </>
      )}
    </>
  )
}
