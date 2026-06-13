'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { ButtonLoadingLabel } from '@/components/ui/button-loading-label'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  MEMBER_REMOVAL_NOTE_MAX_LENGTH,
  MEMBER_REMOVAL_NOTE_MIN_LENGTH,
  parseMemberRemovalNote,
} from '@/lib/member-removal-note'
import { toast } from '@/lib/toast'

type MemberRemovalNoteDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: React.ReactNode
  /** Extra content shown below the note (e.g. cascade impact warning). */
  extraContent?: React.ReactNode
  confirmLabel: string
  loading?: boolean
  onConfirm: (note: string) => void | Promise<void>
}

export default function MemberRemovalNoteDialog({
  open,
  onOpenChange,
  title,
  description,
  extraContent,
  confirmLabel,
  loading = false,
  onConfirm,
}: MemberRemovalNoteDialogProps) {
  const [note, setNote] = useState('')

  useEffect(() => {
    if (!open) {
      setNote('')
    }
  }, [open])

  const handleConfirm = async () => {
    const parsed = parseMemberRemovalNote(note)
    if (!parsed.ok) {
      toast.error('Removal note required', parsed.error)
      return
    }
    await onConfirm(parsed.note)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription asChild>
            <div className="space-y-2 text-sm text-muted-foreground">{description}</div>
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="removal_note">
            Audit note <span className="text-destructive">*</span>
          </Label>
          <Textarea
            id="removal_note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Explain why this member is leaving or being removed (required for the audit log)."
            rows={4}
            maxLength={MEMBER_REMOVAL_NOTE_MAX_LENGTH}
            disabled={loading}
            required
          />
          <p className="text-xs text-muted-foreground">
            {MEMBER_REMOVAL_NOTE_MIN_LENGTH}–{MEMBER_REMOVAL_NOTE_MAX_LENGTH} characters. Stored
            permanently in the audit trail.
          </p>
        </div>
        {extraContent}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={() => void handleConfirm()} disabled={loading}>
            <ButtonLoadingLabel loading={loading} loadingLabel="Submitting…">
              {confirmLabel}
            </ButtonLoadingLabel>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
