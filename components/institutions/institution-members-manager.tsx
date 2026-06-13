'use client'

import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { ButtonLoadingLabel } from '@/components/ui/button-loading-label'
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
import { INSTITUTION_REVOKE } from '@/lib/supabase/member-revocation'
import InstitutionMemberIdentity from '@/components/institutions/institution-member-identity'
import MemberRemovalNoteDialog from '@/components/members/member-removal-note-dialog'

interface Member {
  id: string
  user_id: string
  role: string
  title?: string | null
  granted_at: string
  granted_by: string | null
  email: string
  member_display_name?: string
}

interface PendingInvite {
  id: string
  email: string
  role: string
  invited_at: string
  expires_at: string
  last_sent_at: string | null
  resend_count: number | null
}

interface InstitutionMembersManagerProps {
  institutionId: string
  currentUserId: string
}

function institutionRemoveDisabled(
  m: Member,
  members: Member[],
  currentUserId: string
): { disabled: boolean; title?: string } {
  if (m.user_id === currentUserId) {
    return { disabled: true, title: INSTITUTION_REVOKE.self }
  }
  if (members.length <= 1) {
    return { disabled: true, title: INSTITUTION_REVOKE.lastMember }
  }
  const admins = members.filter((x) => x.role === 'admin')
  if (m.role === 'admin' && admins.length <= 1) {
    return { disabled: true, title: INSTITUTION_REVOKE.lastAdmin }
  }
  return { disabled: false }
}

type RemovalImpactStudy = { study_id: string; study_title: string; roles: string[] }

type RemovalImpactPayload = {
  applies: boolean
  studies: RemovalImpactStudy[]
  openTaskAssigneeCount: number
}

function scrollToPendingInvites() {
  const el = document.getElementById('pending-invites-section')
  el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

export default function InstitutionMembersManager({
  institutionId,
  currentUserId,
}: InstitutionMembersManagerProps) {
  const [members, setMembers] = useState<Member[]>([])
  const [pendingInvites, setPendingInvites] = useState<PendingInvite[]>([])
  const [membersLoading, setMembersLoading] = useState(true)
  const [invitesLoading, setInvitesLoading] = useState(true)
  const [allowExternalCollaborators, setAllowExternalCollaborators] = useState(true)
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<'admin' | 'member'>('member')
  const [addLoading, setAddLoading] = useState(false)
  const [revokingMemberId, setRevokingMemberId] = useState<string | null>(null)
  const [removeTarget, setRemoveTarget] = useState<Member | null>(null)
  const [cascadeImpact, setCascadeImpact] = useState<RemovalImpactPayload | null>(null)
  const [updatingRoleMemberId, setUpdatingRoleMemberId] = useState<string | null>(null)
  const [titleDrafts, setTitleDrafts] = useState<Record<string, string>>({})
  const [savingTitleMemberId, setSavingTitleMemberId] = useState<string | null>(null)
  const [resendingInviteId, setResendingInviteId] = useState<string | null>(null)
  const [revokingInviteId, setRevokingInviteId] = useState<string | null>(null)

  const fetchMembers = useCallback(async () => {
    setMembersLoading(true)
    try {
      const res = await fetch(`/api/institutions/${institutionId}/members`)
      const data = await res.json()
      if (!res.ok) throw new Error(typeof data.error === 'string' ? data.error : res.statusText)
      const list = Array.isArray(data) ? data : (data.members ?? [])
      setMembers(list)
      if (!Array.isArray(data) && typeof data.allow_external_collaborators === 'boolean') {
        setAllowExternalCollaborators(data.allow_external_collaborators)
      }
    } catch (e) {
      toast.error('Load failed', e instanceof Error ? e.message : 'Failed to load members')
    } finally {
      setMembersLoading(false)
    }
  }, [institutionId])

  const fetchPendingInvites = useCallback(async () => {
    setInvitesLoading(true)
    try {
      const res = await fetch(`/api/institutions/${institutionId}/invites`)
      const data = (await res.json()) as { invites?: PendingInvite[]; error?: string }
      if (!res.ok) throw new Error(data.error || res.statusText)
      setPendingInvites(Array.isArray(data.invites) ? data.invites : [])
    } catch (e) {
      toast.error(
        'Pending invites',
        e instanceof Error ? e.message : 'Failed to load pending invites'
      )
    } finally {
      setInvitesLoading(false)
    }
  }, [institutionId])

  useEffect(() => {
    void fetchMembers()
    void fetchPendingInvites()
  }, [fetchMembers, fetchPendingInvites])

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault()
    const emailTrim = email.trim()
    if (!emailTrim) return
    setAddLoading(true)
    try {
      const res = await fetch(`/api/institutions/${institutionId}/invites`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: emailTrim, role }),
      })
      const data = (await res.json()) as {
        error?: string
        code?: string
        invite_id?: string
        email_dispatched?: boolean
        email_channel?: string
        email_dispatch_message?: string
        email_supabase_error?: { code?: string; message?: string }
      }
      if (res.status === 409 && data.code === 'duplicate_pending_invite') {
        toast.warning(
          'Already invited',
          'An invite is already pending for this email. Use Resend or Revoke in Pending invites below.'
        )
        scrollToPendingInvites()
        await fetchPendingInvites()
        return
      }
      if (!res.ok) throw new Error(data.error || res.statusText)
      setEmail('')
      setRole('member')
      if (data.email_dispatched) {
        toast.success(
          'Invite sent',
          data.email_channel === 'supabase'
            ? 'They should get an email from your Supabase Auth mailer. They will complete account setup first, then accept under Invites.'
            : data.email_dispatch_message ??
                'The recipient should receive an email shortly.'
        )
      } else {
        const codeHint =
          data.email_supabase_error?.code &&
          typeof data.email_supabase_error.code === 'string'
            ? ` Auth code: ${data.email_supabase_error.code}.`
            : ''
        const msgHint =
          data.email_supabase_error?.message &&
          typeof data.email_supabase_error.message === 'string'
            ? ` Details: ${data.email_supabase_error.message.slice(0, 280)}${data.email_supabase_error.message.length > 280 ? '…' : ''}`
            : ''
        toast.warning(
          'Invite created',
          (data.email_dispatch_message ??
            'Email was not sent. For existing accounts without Postmark configured, ask them to sign in and open Invites.') +
            codeHint +
            msgHint
        )
      }
      await fetchMembers()
      await fetchPendingInvites()
    } catch (e) {
      toast.error('Invite failed', e instanceof Error ? e.message : 'Failed to send invite')
    } finally {
      setAddLoading(false)
    }
  }

  const handleResendInvite = async (inv: PendingInvite) => {
    setResendingInviteId(inv.id)
    try {
      const res = await fetch(
        `/api/institutions/${institutionId}/invites/${inv.id}/resend`,
        { method: 'POST' }
      )
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || res.statusText)
      toast.success('Invite resent', 'A fresh link was emailed (when mail is configured).')
      await fetchPendingInvites()
    } catch (e) {
      toast.error('Resend failed', e instanceof Error ? e.message : 'Failed to resend')
    } finally {
      setResendingInviteId(null)
    }
  }

  const handleRevokeInvite = async (inv: PendingInvite) => {
    if (
      !window.confirm(
        `Revoke the pending invite to ${inv.email}? They will not be able to accept it unless you send a new invite.`
      )
    ) {
      return
    }
    setRevokingInviteId(inv.id)
    try {
      const res = await fetch(
        `/api/institutions/${institutionId}/invites/${inv.id}/revoke`,
        { method: 'POST' }
      )
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || res.statusText)
      toast.success('Invite revoked')
      await fetchPendingInvites()
    } catch (e) {
      toast.error('Revoke failed', e instanceof Error ? e.message : 'Failed to revoke invite')
    } finally {
      setRevokingInviteId(null)
    }
  }

  const handleRemoveMember = async (removalNote: string) => {
    if (!removeTarget) return
    setRevokingMemberId(removeTarget.id)
    try {
      const patch = async (confirmStudyAccessRevocation: boolean) => {
        const res = await fetch(`/api/institutions/${institutionId}/members`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            memberId: removeTarget.id,
            revoked: true,
            removalNote,
            confirmStudyAccessRevocation,
          }),
        })
        const data = (await res.json().catch(() => ({}))) as {
          error?: string
          code?: string
          impact?: RemovalImpactPayload
        }
        return { res, data }
      }

      let { res, data } = await patch(Boolean(cascadeImpact))

      if (
        res.status === 409 &&
        data?.code === 'study_access_revocation_required' &&
        data.impact?.applies &&
        !cascadeImpact
      ) {
        setCascadeImpact(data.impact)
        return
      }

      if (!res.ok) throw new Error(data.error || res.statusText)
      toast.success('Member removed')
      setRemoveTarget(null)
      setCascadeImpact(null)
      await fetchMembers()
    } catch (e) {
      toast.error(
        'Revoke failed',
        e instanceof Error ? e.message : 'Failed to remove member'
      )
    } finally {
      setRevokingMemberId(null)
    }
  }

  const handleSaveTitle = async (m: Member) => {
    const draft = titleDrafts[m.id] ?? m.title ?? ''
    setSavingTitleMemberId(m.id)
    try {
      const res = await fetch(`/api/institutions/${institutionId}/members`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ memberId: m.id, title: draft }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(typeof data.error === 'string' ? data.error : res.statusText)
      toast.success('Title updated')
      await fetchMembers()
      setTitleDrafts((prev) => {
        const next = { ...prev }
        delete next[m.id]
        return next
      })
    } catch (e) {
      toast.error('Save failed', e instanceof Error ? e.message : 'Could not update title')
    } finally {
      setSavingTitleMemberId(null)
    }
  }

  const handleChangeRole = async (m: Member, nextRole: 'admin' | 'member') => {
    if (m.role === nextRole) return
    const admins = members.filter((x) => x.role === 'admin')
    if (m.user_id === currentUserId) {
      toast.error('Role change blocked', INSTITUTION_REVOKE.self)
      return
    }
    if (m.role === 'admin' && nextRole === 'member') {
      if (admins.length <= 1) {
        toast.error('Role change blocked', INSTITUTION_REVOKE.lastAdmin)
        return
      }
      if (admins.length === 2) {
        const remainingAdmin = admins.find((x) => x.user_id !== m.user_id)
        const remainingLabel = remainingAdmin?.member_display_name?.trim() || remainingAdmin?.email
        const targetLabel = m.member_display_name?.trim() || m.email
        const confirmed = window.confirm(
          [
            `Demote ${targetLabel} from admin to member?`,
            '',
            `${remainingLabel ?? 'Another member'} will become the only admin for this institution.`,
            'You can promote another admin after this change.',
          ].join('\n')
        )
        if (!confirmed) return
      }
    }

    setUpdatingRoleMemberId(m.id)
    try {
      const res = await fetch(`/api/institutions/${institutionId}/members`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ memberId: m.id, role: nextRole }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || res.statusText)
      toast.success('Role updated')
      await fetchMembers()
    } catch (e) {
      toast.error(
        'Role update failed',
        e instanceof Error ? e.message : 'Failed to update member role'
      )
    } finally {
      setUpdatingRoleMemberId(null)
    }
  }

  const inviteStatusLabel = (inv: PendingInvite) => {
    const n = inv.resend_count ?? 0
    if (n <= 0) return 'Sent'
    return `Resent ${n}×`
  }

  return (
    <div className="space-y-6">
      <form onSubmit={handleInvite} className="flex flex-wrap items-end gap-4 rounded-lg border p-4">
        <div className="flex-1 min-w-[200px]">
          <Label htmlFor="invite-email">Email</Label>
          <Input
            id="invite-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="user@example.com"
            className="mt-1"
          />
        </div>
        <div className="w-[140px]">
          <Label htmlFor="invite-role">Role</Label>
          <select
            id="invite-role"
            value={role}
            onChange={(e) => setRole(e.target.value as 'admin' | 'member')}
            className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="member">Member</option>
            <option value="admin">Admin</option>
          </select>
        </div>
        <Button type="submit" disabled={addLoading} aria-busy={addLoading}>
          <ButtonLoadingLabel loading={addLoading} loadingLabel="Sending…">
            Invite
          </ButtonLoadingLabel>
        </Button>
      </form>

      {!allowExternalCollaborators && (
        <p className="text-sm text-muted-foreground max-w-3xl leading-relaxed">
          This institution only allows <strong>institution members</strong> on studies. Removing someone from the
          institution also revokes their access to draft and active studies under this institution and removes them
          from open tasks they were assigned. Completed work and audit entries are preserved.
        </p>
      )}

      <Card id="pending-invites-section">
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">Pending invites</CardTitle>
          <CardDescription>
            Open invitations that have not been accepted yet. Avoid sending a duplicate invite for the same
            email—use <strong>Resend</strong> to rotate the link and extend the expiry, or <strong>Revoke</strong> to
            cancel.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {invitesLoading ? (
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading pending invites…
            </div>
          ) : pendingInvites.length === 0 ? (
            <p className="text-sm text-muted-foreground">No pending invites for this institution.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Sent</TableHead>
                  <TableHead>Expires</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pendingInvites.map((inv) => (
                  <TableRow key={inv.id}>
                    <TableCell className="font-medium">{inv.email}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{inv.role}</Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(inv.last_sent_at ?? inv.invited_at).toLocaleString()}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(inv.expires_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-sm">{inviteStatusLabel(inv)}</TableCell>
                    <TableCell className="text-right space-x-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={resendingInviteId === inv.id || revokingInviteId === inv.id}
                        onClick={() => handleResendInvite(inv)}
                        aria-busy={resendingInviteId === inv.id}
                      >
                        <ButtonLoadingLabel
                          loading={resendingInviteId === inv.id}
                          loadingLabel="Sending…"
                        >
                          Resend
                        </ButtonLoadingLabel>
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={resendingInviteId === inv.id || revokingInviteId === inv.id}
                        onClick={() => handleRevokeInvite(inv)}
                        aria-busy={revokingInviteId === inv.id}
                      >
                        <ButtonLoadingLabel
                          loading={revokingInviteId === inv.id}
                          loadingLabel="Revoking…"
                        >
                          Revoke
                        </ButtonLoadingLabel>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <div>
        <h2 className="text-lg font-semibold mb-2">Members</h2>
        {membersLoading ? (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading members…
          </div>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Added</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {members.map((m) => {
                  const remove = institutionRemoveDisabled(m, members, currentUserId)
                  return (
                    <TableRow key={m.id}>
                      <TableCell>
                        <InstitutionMemberIdentity
                          displayName={m.member_display_name ?? m.email}
                          email={m.email}
                          title={m.title}
                          showEmail={false}
                        />
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1 max-w-[220px]">
                          <Input
                            value={titleDrafts[m.id] ?? m.title ?? ''}
                            onChange={(e) =>
                              setTitleDrafts((prev) => ({ ...prev, [m.id]: e.target.value }))
                            }
                            placeholder="e.g. Principal Investigator"
                            className="h-8 text-sm"
                            maxLength={120}
                            disabled={savingTitleMemberId === m.id || revokingMemberId === m.id}
                          />
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="self-start"
                            disabled={
                              savingTitleMemberId === m.id ||
                              revokingMemberId === m.id ||
                              (titleDrafts[m.id] ?? m.title ?? '').trim() ===
                                (m.title?.trim() ?? '')
                            }
                            onClick={() => void handleSaveTitle(m)}
                            aria-busy={savingTitleMemberId === m.id}
                          >
                            <ButtonLoadingLabel
                              loading={savingTitleMemberId === m.id}
                              loadingLabel="Saving…"
                            >
                              Save title
                            </ButtonLoadingLabel>
                          </Button>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{m.email}</TableCell>
                      <TableCell>
                        <select
                          value={m.role}
                          onChange={(e) => {
                            const nextRole = e.target.value as 'admin' | 'member'
                            void handleChangeRole(m, nextRole)
                          }}
                          disabled={
                            updatingRoleMemberId === m.id ||
                            revokingMemberId === m.id ||
                            m.user_id === currentUserId ||
                            (m.role === 'admin' &&
                              members.filter((x) => x.role === 'admin').length <= 1)
                          }
                          title={
                            m.user_id === currentUserId
                              ? INSTITUTION_REVOKE.self
                              : m.role === 'admin' &&
                                  members.filter((x) => x.role === 'admin').length <= 1
                                ? INSTITUTION_REVOKE.lastAdmin
                                : undefined
                          }
                          className="block w-[120px] rounded-md border border-input bg-background px-2 py-1 text-sm"
                        >
                          <option value="member">Member</option>
                          <option value="admin">Admin</option>
                        </select>
                      </TableCell>
                      <TableCell className="text-sm text-gray-500">
                        {new Date(m.granted_at).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setCascadeImpact(null)
                            setRemoveTarget(m)
                          }}
                          disabled={remove.disabled || revokingMemberId === m.id}
                          title={remove.title}
                        >
                          {revokingMemberId === m.id ? 'Removing…' : 'Remove'}
                        </Button>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
            {members.length === 0 && (
              <p className="text-gray-500 mt-2">No members yet. Invite someone above.</p>
            )}
          </>
        )}
      </div>

      <MemberRemovalNoteDialog
        open={removeTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            setRemoveTarget(null)
            setCascadeImpact(null)
          }
        }}
        title="Remove institution member?"
        description={
          removeTarget ? (
            <p>
              Remove{' '}
              <span className="font-medium text-foreground">
                {removeTarget.member_display_name?.trim() || removeTarget.email}
              </span>{' '}
              from this institution. This is recorded in the institution audit log.
            </p>
          ) : null
        }
        extraContent={
          cascadeImpact?.applies ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50/80 p-3 text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
              <p className="font-medium">Study access will also be revoked</p>
              <p className="mt-1">
                This institution only allows institution members on studies. Removing this person
                will end their participation on draft or active studies listed below and unassign
                them from {cascadeImpact.openTaskAssigneeCount} open task(s).
              </p>
              {cascadeImpact.studies.length > 0 ? (
                <ul className="mt-2 list-inside list-disc space-y-0.5">
                  {cascadeImpact.studies.map((s) => (
                    <li key={s.study_id}>
                      {s.study_title} ({s.roles.join(', ')})
                    </li>
                  ))}
                </ul>
              ) : null}
              <p className="mt-2 text-xs">
                Click <strong>Confirm removal</strong> again to proceed. Records and prior audit
                history are not deleted.
              </p>
            </div>
          ) : null
        }
        confirmLabel={cascadeImpact ? 'Confirm removal' : 'Remove member'}
        loading={revokingMemberId !== null}
        onConfirm={handleRemoveMember}
      />
    </div>
  )
}
