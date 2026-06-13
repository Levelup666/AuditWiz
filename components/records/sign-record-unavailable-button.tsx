'use client'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'

/** Shown when the user can sign by role but password re-auth is not available (e.g. ORCID-only). */
export default function SignRecordUnavailableButton() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline">Sign Record</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Signing not available yet</DialogTitle>
          <DialogDescription className="space-y-2 text-left">
            <span className="block">
              Electronic signatures currently require password re-authentication. Your account uses
              ORCID sign-in only.
            </span>
            <span className="block text-muted-foreground">
              ORCID step-up signing will be added in a future release. Until then, ask a study admin
              if another approver can sign this record.
            </span>
          </DialogDescription>
        </DialogHeader>
      </DialogContent>
    </Dialog>
  )
}
