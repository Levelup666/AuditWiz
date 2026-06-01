'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { ButtonLoadingLabel } from '@/components/ui/button-loading-label'
import { toast } from '@/lib/toast'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { LogOut } from 'lucide-react'

interface LeaveStudyButtonProps {
  studyId: string
  studyTitle: string
  /** When set, button is disabled with this message (e.g. last admin). */
  disabledReason?: string | null
}

export default function LeaveStudyButton({
  studyId,
  studyTitle,
  disabledReason,
}: LeaveStudyButtonProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)

  const handleLeave = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/studies/${studyId}/members/leave`, { method: 'POST' })
      const data = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) {
        throw new Error(data.error || 'Could not leave study')
      }
      setOpen(false)
      toast.success('You left the study')
      router.push('/studies')
      router.refresh()
    } catch (e) {
      toast.error('Could not leave study', e instanceof Error ? e.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <Button
        variant="outline"
        disabled={Boolean(disabledReason)}
        title={disabledReason ?? undefined}
        onClick={() => setOpen(true)}
      >
        <LogOut className="mr-2 h-4 w-4" />
        Leave study
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Leave this study?</DialogTitle>
            <DialogDescription>
              You will lose access to <span className="font-medium text-foreground">{studyTitle}</span>.
              You will be removed from open task assignments. This action is recorded in the study audit
              log and study admins will be notified.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={loading}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={() => void handleLeave()} disabled={loading}>
              <ButtonLoadingLabel loading={loading} loadingLabel="Leaving…">
                Leave study
              </ButtonLoadingLabel>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
