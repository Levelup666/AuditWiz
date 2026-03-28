'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { toast } from '@/lib/toast'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Loader2 } from 'lucide-react'
import {
  isStudyPrivilegedRole,
  STUDY_REVOKE,
} from '@/lib/supabase/member-revocation'
import { cn } from '@/lib/utils'

interface Member {
  id: string
  user_id: string
  role: string
  granted_at: string
  granted_by: string | null
  email: string
  orcid_id?: string | null
  can_view?: boolean
  can_comment?: boolean
  can_review?: boolean
  can_approve?: boolean
  can_share?: boolean
}

type InstitutionCandidate = {
  user_id: string
  email: string
  display_name: string | null
  orcid_id: string | null
}

interface StudyMembersManagerProps {
  studyId: string
  currentUserId: string
  /** When set, internal-member picker loads from the institution */
  institutionId: string | null
  allowExternalCollaborators: boolean
}

function studyRevokeDisabled(
  m: Member,
  members: Member[],
  currentUserId: string
): { disabled: boolean; title?: string } {
  if (m.user_id === currentUserId) {
    return { disabled: true, title: STUDY_REVOKE.self }
  }
  if (members.length <= 1) {
    return { disabled: true, title: STUDY_REVOKE.lastMember }
  }
  const privileged = members.filter((x) => isStudyPrivilegedRole(x.role))
  if (privileged.length <= 1 && isStudyPrivilegedRole(m.role)) {
    return { disabled: true, title: STUDY_REVOKE.lastPrivileged }
  }
  return { disabled: false }
}

function candidateLabel(c: InstitutionCandidate): string {
  const name = c.display_name?.trim()
  if (name && c.email) return `${name} · ${c.email}`
  if (name) return name
  return c.email || c.user_id.slice(0, 8) + '…'
}

function toastStudyInviteEmail(
  data: {
    message?: string
    pending?: boolean
    email_dispatched?: boolean
    email_dispatch_message?: string
    email_supabase_error?: { code?: string }
  },
  variant: 'member_added' | 'invite_pending'
) {
  const hint =
    data.email_supabase_error?.code &&
    typeof data.email_supabase_error.code === 'string'
      ? ` (Auth error code: ${data.email_supabase_error.code})`
      : ''
  if (data.email_dispatched === false && data.email_dispatch_message) {
    toast.warning(
      variant === 'invite_pending' ? 'Invite created' : 'Member added',
      data.email_dispatch_message + hint
    )
    return
  }
  toast.success(
    variant === 'invite_pending' ? 'Pending invite created' : 'Member added',
    data.message ??
      (variant === 'invite_pending'
        ? 'Pending invite created'
        : 'They can also open Invites in the app.')
  )
}

export default function StudyMembersManager({
  studyId,
  currentUserId,
  institutionId,
  allowExternalCollaborators,
}: StudyMembersManagerProps) {
  const [members, setMembers] = useState<Member[]>([])
  const [loading, setLoading] = useState(true)
  const [email, setEmail] = useState('')
  const [orcidId, setOrcidId] = useState('')
  const [role, setRole] = useState('reviewer')
  const [addLoading, setAddLoading] = useState(false)
  const [revokingId, setRevokingId] = useState<string | null>(null)

  const [candidates, setCandidates] = useState<InstitutionCandidate[]>([])
  const [candidatesLoading, setCandidatesLoading] = useState(false)
  const [selectedUserId, setSelectedUserId] = useState('')

  const useInstitutionPicker = Boolean(institutionId)
  const showModeToggle = useInstitutionPicker && allowExternalCollaborators
  const [addMode, setAddMode] = useState<'internal' | 'external'>('internal')

  const effectiveMode = showModeToggle ? addMode : useInstitutionPicker ? 'internal' : 'external'

  useEffect(() => {
    setAddMode(
      institutionId && allowExternalCollaborators
        ? 'internal'
        : institutionId
          ? 'internal'
          : 'external'
    )
    setEmail('')
    setSelectedUserId('')
    setOrcidId('')
    setRole('reviewer')
  }, [studyId, institutionId, allowExternalCollaborators])

  const fetchMembers = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/studies/${studyId}/members`)
      if (!res.ok) throw new Error(await res.json().then((b) => b.error || res.statusText))
      const data = await res.json()
      setMembers(data)
    } catch (e) {
      toast.error('Load failed', e instanceof Error ? e.message : 'Failed to load members')
    } finally {
      setLoading(false)
    }
  }

  const fetchCandidates = async () => {
    if (!useInstitutionPicker) return
    setCandidatesLoading(true)
    try {
      const res = await fetch(`/api/studies/${studyId}/member-candidates`)
      if (!res.ok) throw new Error(await res.json().then((b) => b.error || res.statusText))
      const data = await res.json()
      setCandidates(data.candidates ?? [])
    } catch (e) {
      toast.error(
        'Could not load institution members',
        e instanceof Error ? e.message : 'Request failed'
      )
      setCandidates([])
    } finally {
      setCandidatesLoading(false)
    }
  }

  useEffect(() => {
    fetchMembers()
  }, [studyId])

  useEffect(() => {
    if (useInstitutionPicker) {
      fetchCandidates()
    }
  }, [studyId, useInstitutionPicker])

  const emptyCandidates =
    useInstitutionPicker && !candidatesLoading && candidates.length === 0

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    const emailTrim = email.trim()
    const orcidTrim = orcidId.trim()

    if (effectiveMode === 'internal' && useInstitutionPicker && selectedUserId) {
      setAddLoading(true)
      try {
        const body: {
          user_id: string
          role: string
          orcid_id?: string
        } = { user_id: selectedUserId, role }
        if (orcidTrim) body.orcid_id = orcidTrim
        const res = await fetch(`/api/studies/${studyId}/members`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || res.statusText)
        setSelectedUserId('')
        setOrcidId('')
        setRole('reviewer')
        toastStudyInviteEmail(data, 'member_added')
        fetchMembers()
        fetchCandidates()
      } catch (err) {
        toast.error('Add failed', err instanceof Error ? err.message : 'Failed to add member')
      } finally {
        setAddLoading(false)
      }
      return
    }

    if (effectiveMode === 'internal' && useInstitutionPicker && !emailTrim && !orcidTrim) {
      toast.error(
        'Choose someone or use ORCID',
        'Select an institution member, or enter an ORCID ID (or email when allowed).'
      )
      return
    }

    if (!emailTrim && !orcidTrim) return
    setAddLoading(true)
    try {
      const body: { email?: string; orcid_id?: string; role: string } = { role }
      if (orcidTrim) body.orcid_id = orcidTrim
      if (emailTrim) body.email = emailTrim
      const res = await fetch(`/api/studies/${studyId}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || res.statusText)
      setEmail('')
      setOrcidId('')
      setRole('reviewer')
      if (data.pending) {
        toastStudyInviteEmail(data, 'invite_pending')
      } else {
        toastStudyInviteEmail(data, 'member_added')
      }
      fetchMembers()
      fetchCandidates()
    } catch (e) {
      toast.error('Add failed', e instanceof Error ? e.message : 'Failed to add member')
    } finally {
      setAddLoading(false)
    }
  }

  const handleRevoke = async (memberId: string) => {
    setRevokingId(memberId)
    try {
      const res = await fetch(`/api/studies/${studyId}/members`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ memberId, revoked: true }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || res.statusText)
      toast.success('Member revoked')
      fetchMembers()
      fetchCandidates()
    } catch (e) {
      toast.error(
        'Revoke failed',
        e instanceof Error ? e.message : 'Failed to revoke member'
      )
    } finally {
      setRevokingId(null)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading members…
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground max-w-3xl leading-relaxed">
        People with accounts can accept pending invites under <strong>Invites</strong> in the sidebar
        without using email links.
        {!useInstitutionPicker && (
          <>
            {' '}
            This study is not linked to an institution; add people by email or ORCID as before.
          </>
        )}
        {useInstitutionPicker && !allowExternalCollaborators && (
          <>
            {' '}
            This institution only allows <strong>institution members</strong> on studies—choose someone
            from the list below.
          </>
        )}
        {useInstitutionPicker && allowExternalCollaborators && (
          <>
            {' '}
            You may add <strong>institution members</strong> from the directory or send an{' '}
            <strong>external invite</strong> by email when the institution allows it.
          </>
        )}
      </p>

      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-lg">Add member</CardTitle>
          <CardDescription>
            Assign a role for this study. Optional ORCID can still be used for invite-by-ORCID when
            you are not using the institution directory.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleAdd} className="space-y-5">
            {showModeToggle && (
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <span className="text-sm font-medium text-foreground">How to add</span>
                <div
                  className="inline-flex rounded-lg border border-input bg-muted/30 p-0.5"
                  role="group"
                  aria-label="Add member mode"
                >
                  <button
                    type="button"
                    onClick={() => {
                      setAddMode('internal')
                      setEmail('')
                    }}
                    className={cn(
                      'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                      addMode === 'internal'
                        ? 'bg-background text-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground'
                    )}
                  >
                    Institution member
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setAddMode('external')
                      setSelectedUserId('')
                    }}
                    className={cn(
                      'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                      addMode === 'external'
                        ? 'bg-background text-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground'
                    )}
                  >
                    External invite
                  </button>
                </div>
              </div>
            )}

            {effectiveMode === 'internal' && useInstitutionPicker && (
              <div className="space-y-2">
                <Label htmlFor="member-institution">Institution member</Label>
                <div>
                  <select
                    id="member-institution"
                    value={selectedUserId}
                    onChange={(e) => setSelectedUserId(e.target.value)}
                    disabled={candidatesLoading || emptyCandidates}
                    className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <option value="">
                      {candidatesLoading ? 'Loading…' : emptyCandidates ? 'No one available' : 'Select a person…'}
                    </option>
                    {candidates.map((c) => (
                      <option key={c.user_id} value={c.user_id}>
                        {candidateLabel(c)}
                      </option>
                    ))}
                  </select>
                </div>
                {emptyCandidates && (
                  <p className="text-sm text-muted-foreground">
                    Every active institution member is already on this study, or there are no members
                    in the institution yet.
                  </p>
                )}
              </div>
            )}

            {effectiveMode === 'external' && (
              <div className="space-y-2">
                <Label htmlFor="member-email">Email</Label>
                <Input
                  id="member-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="user@example.com"
                  className="mt-1"
                  autoComplete="email"
                />
              </div>
            )}

            <div className="grid gap-4 sm:grid-cols-2 sm:items-end">
              <div className="space-y-2">
                <Label htmlFor="member-orcid">ORCID ID (optional)</Label>
                <Input
                  id="member-orcid"
                  type="text"
                  value={orcidId}
                  onChange={(e) => setOrcidId(e.target.value)}
                  placeholder="0000-0001-2345-6789"
                  className="mt-1"
                  autoComplete="off"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="member-role">Role</Label>
                <select
                  id="member-role"
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <option value="creator">Creator</option>
                  <option value="reviewer">Reviewer</option>
                  <option value="approver">Approver</option>
                  <option value="auditor">Auditor</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
            </div>

            <div className="flex justify-end border-t pt-4">
              <Button
                type="submit"
                disabled={
                  addLoading ||
                  (effectiveMode === 'internal' &&
                    useInstitutionPicker &&
                    !selectedUserId &&
                    !orcidId.trim()) ||
                  (effectiveMode === 'external' && !email.trim() && !orcidId.trim())
                }
              >
                {addLoading
                  ? 'Adding…'
                  : effectiveMode === 'internal' && useInstitutionPicker
                    ? 'Add member'
                    : 'Add or invite'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Email</TableHead>
            <TableHead>ORCID</TableHead>
            <TableHead>Role</TableHead>
            <TableHead>Added</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {members.map((m) => {
            const revoke = studyRevokeDisabled(m, members, currentUserId)
            return (
              <TableRow key={m.id}>
                <TableCell className="font-medium">{m.email}</TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {m.orcid_id ?? '—'}
                </TableCell>
                <TableCell>
                  <Badge variant="outline">{m.role}</Badge>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {new Date(m.granted_at).toLocaleDateString()}
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleRevoke(m.id)}
                    disabled={revoke.disabled || revokingId === m.id}
                    title={revoke.title}
                  >
                    {revokingId === m.id ? 'Revoking…' : 'Revoke'}
                  </Button>
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
      {members.length === 0 && (
        <p className="text-muted-foreground">No members yet. Add one above.</p>
      )}
    </div>
  )
}
