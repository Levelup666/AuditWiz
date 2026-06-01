'use client'

import { useCallback, useEffect, useState } from 'react'
import { Button, buttonVariants } from '@/components/ui/button'
import type { VariantProps } from 'class-variance-authority'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Users } from 'lucide-react'
import { formatStudyRoleLabel } from '@/lib/study-role-display'

type RosterMember = {
  user_id: string
  role: string
  email: string
  member_display_name?: string
}

interface StudyMembersRosterDialogProps {
  studyId: string
  studyTitle: string
  buttonSize?: VariantProps<typeof buttonVariants>['size']
}

export default function StudyMembersRosterDialog({
  studyId,
  studyTitle,
  buttonSize = 'sm',
}: StudyMembersRosterDialogProps) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [members, setMembers] = useState<RosterMember[]>([])

  const loadMembers = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/studies/${studyId}/members`)
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(data.error || 'Could not load study members')
      }
      const data = (await res.json()) as { members?: RosterMember[] }
      setMembers(data.members ?? [])
    } catch (e) {
      setMembers([])
      setError(e instanceof Error ? e.message : 'Could not load study members')
    } finally {
      setLoading(false)
    }
  }, [studyId])

  useEffect(() => {
    if (open) {
      void loadMembers()
    }
  }, [open, loadMembers])

  return (
    <>
      <Button variant="outline" size={buttonSize} onClick={() => setOpen(true)}>
        <Users className={buttonSize === 'sm' ? 'mr-1.5 h-3.5 w-3.5' : 'mr-2 h-4 w-4'} />
        Members
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Study members</DialogTitle>
            <DialogDescription>
              Active members of <span className="font-medium text-foreground">{studyTitle}</span>
            </DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-auto -mx-1 px-1">
            {loading ? (
              <p className="py-8 text-center text-sm text-muted-foreground">Loading members…</p>
            ) : error ? (
              <p className="py-8 text-center text-sm text-destructive">{error}</p>
            ) : members.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">No active members.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Email</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {members.map((m) => (
                    <TableRow key={m.user_id}>
                      <TableCell className="font-medium">
                        {m.member_display_name?.trim() || m.email}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{formatStudyRoleLabel(m.role)}</Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{m.email}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
