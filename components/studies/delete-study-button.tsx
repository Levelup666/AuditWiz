'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { toast } from '@/lib/toast'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Trash2 } from 'lucide-react'

interface DeleteStudyButtonProps {
  studyId: string
  studyTitle: string
}

export default function DeleteStudyButton({ studyId, studyTitle }: DeleteStudyButtonProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [confirmText, setConfirmText] = useState('')

  const handleDelete = async () => {
    if (confirmText !== studyTitle) {
      toast.error('Confirmation failed', 'Please type the study title exactly to confirm.')
      return
    }
    setLoading(true)
    try {
      const res = await fetch(`/api/studies/${studyId}/delete`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || res.statusText)
      setOpen(false)
      setConfirmText('')
      toast.success('Study deleted')
      router.push('/studies')
      router.refresh()
    } catch (e) {
      toast.error('Delete failed', e instanceof Error ? e.message : 'Failed to delete study')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <Button
        variant="outline"
        onClick={() => setOpen(true)}
        className="text-destructive hover:text-destructive border-destructive/50"
      >
        <Trash2 className="mr-2 h-4 w-4" />
        Delete Study
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Study</DialogTitle>
            <DialogDescription>
              Permanently delete &quot;{studyTitle}&quot;? This cannot be undone. All records, documents, and members
              will be removed. All study members will be notified.
              <br />
              <br />
              This action is only allowed if the study has no approved or blockchain-anchored records.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <p className="text-sm text-muted-foreground">
              Type <strong>{studyTitle}</strong> to confirm:
            </p>
            <input
              type="text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder={studyTitle}
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={loading || confirmText !== studyTitle}
            >
              {loading ? 'Deleting…' : 'Delete Study Permanently'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
