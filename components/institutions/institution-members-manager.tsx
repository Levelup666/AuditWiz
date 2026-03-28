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
import { Loader2 } from 'lucide-react'
import { INSTITUTION_REVOKE } from '@/lib/supabase/member-revocation'

interface Member {
  id: string
  user_id: string
  role: string
  granted_at: string
  granted_by: string | null
  email: string
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

export default function InstitutionMembersManager({
  institutionId,
  currentUserId,
}: InstitutionMembersManagerProps) {
  const [members, setMembers] = useState<Member[]>([])
  const [loading, setLoading] = useState(true)
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<'admin' | 'member'>('member')
  const [addLoading, setAddLoading] = useState(false)
  const [revokingId, setRevokingId] = useState<string | null>(null)

  const fetchMembers = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/institutions/${institutionId}/members`)
      if (!res.ok) throw new Error(await res.json().then((b) => b.error || res.statusText))
      const data = await res.json()
      setMembers(data)
    } catch (e) {
      toast.error('Load failed', e instanceof Error ? e.message : 'Failed to load members')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchMembers()
  }, [institutionId])

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
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || res.statusText)
      setEmail('')
      setRole('member')
      if (data.email_dispatched) {
        toast.success(
          'Invite sent',
          data.email_channel === 'supabase'
            ? 'They should get an email from your Supabase Auth mailer (like sign-up confirmation), then can accept under Invites.'
            : data.email_dispatch_message ??
                'The recipient should receive an email shortly.'
        )
      } else {
        const hint =
          data.email_supabase_error?.code &&
          typeof data.email_supabase_error.code === 'string'
            ? ` (Auth error code: ${data.email_supabase_error.code})`
            : ''
        toast.warning(
          'Invite created',
          (data.email_dispatch_message ??
            'Email was not sent. For existing accounts without Resend, ask them to sign in and open Invites.') + hint
        )
      }
      fetchMembers()
    } catch (e) {
      toast.error('Invite failed', e instanceof Error ? e.message : 'Failed to send invite')
    } finally {
      setAddLoading(false)
    }
  }

  const handleRevoke = async (memberId: string) => {
    setRevokingId(memberId)
    try {
      const res = await fetch(`/api/institutions/${institutionId}/members`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ memberId, revoked: true }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || res.statusText)
      toast.success('Member removed')
      fetchMembers()
    } catch (e) {
      toast.error(
        'Revoke failed',
        e instanceof Error ? e.message : 'Failed to remove member'
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
        <Button type="submit" disabled={addLoading}>
          {addLoading ? 'Sending…' : 'Invite'}
        </Button>
      </form>

      <Table>
        <TableHeader>
          <TableRow>
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
                <TableCell className="font-medium">{m.email}</TableCell>
                <TableCell>
                  <Badge variant="outline">{m.role}</Badge>
                </TableCell>
                <TableCell className="text-sm text-gray-500">
                  {new Date(m.granted_at).toLocaleDateString()}
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleRevoke(m.id)}
                    disabled={remove.disabled || revokingId === m.id}
                    title={remove.title}
                  >
                    {revokingId === m.id ? 'Removing…' : 'Remove'}
                  </Button>
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
      {members.length === 0 && (
        <p className="text-gray-500">No members yet. Invite someone above.</p>
      )}
    </div>
  )
}
