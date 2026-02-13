'use client'

import { useState, useEffect } from 'react'
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
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { createClient } from '@/lib/supabase/client'
import { generateHash } from '@/lib/crypto'

interface AmendRecordButtonProps {
  studyId: string
  recordId: string
  currentContent?: Record<string, unknown>
}

export default function AmendRecordButton({ studyId, recordId, currentContent }: AmendRecordButtonProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [amendmentReason, setAmendmentReason] = useState('')
  const [contentJson, setContentJson] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open && currentContent !== undefined) {
      setContentJson(JSON.stringify(currentContent, null, 2))
    }
  }, [open, currentContent])

  const handleAmend = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError(null)

    if (!amendmentReason.trim()) {
      setError('Amendment reason is required')
      return
    }

    let newContent: Record<string, unknown>
    try {
      newContent = JSON.parse(contentJson) as Record<string, unknown>
    } catch {
      setError('Content must be valid JSON')
      return
    }

    setLoading(true)

    try {
      const supabase = createClient()

      const { data: currentRecord, error: fetchError } = await supabase
        .from('records')
        .select('record_number, version')
        .eq('id', recordId)
        .single()

      if (fetchError || !currentRecord) {
        throw new Error('Failed to fetch current record')
      }

      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        throw new Error('Authentication required')
      }

      const newVersion = currentRecord.version + 1
      const contentHash = await generateHash(newContent)

      const { data: newRecord, error: insertError } = await supabase
        .from('records')
        .insert({
          study_id: studyId,
          record_number: currentRecord.record_number,
          version: newVersion,
          previous_version_id: recordId,
          status: 'draft',
          created_by: user.id,
          content: newContent,
          content_hash: contentHash,
          amendment_reason: amendmentReason.trim(),
        })
        .select()
        .single()

      if (insertError) {
        throw new Error(insertError.message)
      }

      setOpen(false)
      router.refresh()
      router.push(`/studies/${studyId}/records/${newRecord.id}`)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create amendment')
      setLoading(false)
    }
  }

  const loadCurrentContent = async () => {
    if (currentContent !== undefined) return
    const supabase = createClient()
    const { data, error: fetchError } = await supabase
      .from('records')
      .select('content')
      .eq('id', recordId)
      .single()
    if (!fetchError && data?.content) {
      setContentJson(JSON.stringify(data.content, null, 2))
    }
  }

  useEffect(() => {
    if (open) loadCurrentContent()
  }, [open, recordId, currentContent])

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">Amend Record</Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <form onSubmit={handleAmend}>
          <DialogHeader>
            <DialogTitle>Create Amendment</DialogTitle>
            <DialogDescription>
              Amendments create a new version of the record. Edit the content below and provide a reason. The original version remains unchanged.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {error && (
              <div className="rounded-md bg-red-50 p-3">
                <p className="text-sm text-red-800">{error}</p>
              </div>
            )}
            <div>
              <Label htmlFor="amendment-content">Amended Content (JSON) *</Label>
              <Textarea
                id="amendment-content"
                value={contentJson}
                onChange={(e) => setContentJson(e.target.value)}
                className="mt-1 font-mono text-sm min-h-[200px]"
                rows={12}
                required
              />
              <p className="mt-1 text-xs text-gray-500">
                Edit the record content. Must be valid JSON.
              </p>
            </div>
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
