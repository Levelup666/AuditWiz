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
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { createClient } from '@/lib/supabase/client'
import { generateHash } from '@/lib/crypto'

interface AmendRecordButtonProps {
  studyId: string
  recordId: string
}

export default function AmendRecordButton({ studyId, recordId }: AmendRecordButtonProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [amendmentReason, setAmendmentReason] = useState('')
  const [error, setError] = useState<string | null>(null)

  const handleAmend = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError(null)

    if (!amendmentReason.trim()) {
      setError('Amendment reason is required')
      return
    }

    setLoading(true)

    try {
      const supabase = createClient()

      // Fetch current record
      const { data: currentRecord, error: fetchError } = await supabase
        .from('records')
        .select('*')
        .eq('id', recordId)
        .single()

      if (fetchError || !currentRecord) {
        throw new Error('Failed to fetch current record')
      }

      // Create new version with updated content
      // In a real implementation, you'd have a form for editing content
      // For now, we'll just increment version and add amendment reason
      const newVersion = currentRecord.version + 1
      const newContent = currentRecord.content // In production, this would be the amended content
      const contentHash = await generateHash(newContent)

      // Insert new version
      const { data: newRecord, error: insertError } = await supabase
        .from('records')
        .insert({
          study_id: studyId,
          record_number: currentRecord.record_number,
          version: newVersion,
          previous_version_id: currentRecord.id,
          status: 'draft',
          created_by: (await supabase.auth.getUser()).data.user?.id,
          content: newContent,
          content_hash: contentHash,
          amendment_reason: amendmentReason,
        })
        .select()
        .single()

      if (insertError) {
        throw new Error(insertError.message)
      }

      setOpen(false)
      router.refresh()
      router.push(`/studies/${studyId}/records/${newRecord.id}`)
    } catch (err: any) {
      setError(err.message || 'Failed to create amendment')
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">Amend Record</Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={handleAmend}>
          <DialogHeader>
            <DialogTitle>Create Amendment</DialogTitle>
            <DialogDescription>
              Amendments create a new version of the record. The original version remains unchanged.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {error && (
              <div className="rounded-md bg-red-50 p-3">
                <p className="text-sm text-red-800">{error}</p>
              </div>
            )}
            <div>
              <Label htmlFor="amendment-reason">Amendment Reason *</Label>
              <Textarea
                id="amendment-reason"
                required
                value={amendmentReason}
                onChange={(e) => setAmendmentReason(e.target.value)}
                placeholder="Explain why this amendment is necessary..."
                className="mt-1"
                rows={4}
              />
              <p className="mt-1 text-xs text-gray-500">
                This reason will be permanently recorded with the new version.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Creating Amendment...' : 'Submit Amendment'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
