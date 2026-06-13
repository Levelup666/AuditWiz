'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { LogOut } from 'lucide-react'
import { toast } from '@/lib/toast'
import MemberRemovalNoteDialog from '@/components/members/member-removal-note-dialog'

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

  const handleLeave = async (removalNote: string) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/studies/${studyId}/members/leave`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ removalNote }),
      })
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
      <MemberRemovalNoteDialog
        open={open}
        onOpenChange={setOpen}
        title="Leave this study?"
        description={
          <>
            <p>
              You will lose access to{' '}
              <span className="font-medium text-foreground">{studyTitle}</span>. You will be removed
              from open task assignments. Study admins will be notified.
            </p>
            <p>This action is recorded in the study audit log.</p>
          </>
        }
        confirmLabel="Leave study"
        loading={loading}
        onConfirm={handleLeave}
      />
    </>
  )
}
