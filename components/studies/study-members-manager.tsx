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

interface StudyMembersManagerProps {
  studyId: string
}

export default function StudyMembersManager({ studyId }: StudyMembersManagerProps) {
  const [members, setMembers] = useState<Member[]>([])
  const [loading, setLoading] = useState(true)
  const [email, setEmail] = useState('')
  const [orcidId, setOrcidId] = useState('')
  const [role, setRole] = useState('reviewer')
  const [addLoading, setAddLoading] = useState(false)
  const [revokingId, setRevokingId] = useState<string | null>(null)

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

  useEffect(() => {
    fetchMembers()
  }, [studyId])

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    const emailTrim = email.trim()
    const orcidTrim = orcidId.trim()
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
      toast.success(data.pending ? (data.message ?? 'Pending invite created') : 'Member added')
      fetchMembers()
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
    } catch {
      toast.error('Revoke failed', 'Failed to revoke member')
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
      <form onSubmit={handleAdd} className="flex flex-wrap items-end gap-4 rounded-lg border p-4">
        <div className="flex-1 min-w-[200px]">
          <Label htmlFor="member-email">Email</Label>
          <Input
            id="member-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="user@example.com"
            className="mt-1"
          />
        </div>
        <div className="flex-1 min-w-[200px]">
          <Label htmlFor="member-orcid">ORCID ID (optional)</Label>
          <Input
            id="member-orcid"
            type="text"
            value={orcidId}
            onChange={(e) => setOrcidId(e.target.value)}
            placeholder="0000-0001-2345-6789"
            className="mt-1"
          />
        </div>
        <div className="w-[140px]">
          <Label htmlFor="member-role">Role</Label>
          <select
            id="member-role"
            value={role}
            onChange={(e) => setRole(e.target.value)}
            className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="creator">Creator</option>
            <option value="reviewer">Reviewer</option>
            <option value="approver">Approver</option>
            <option value="auditor">Auditor</option>
            <option value="admin">Admin</option>
          </select>
        </div>
        <Button type="submit" disabled={addLoading}>
          {addLoading ? 'Adding…' : 'Add Member'}
        </Button>
      </form>

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
          {members.map((m) => (
            <TableRow key={m.id}>
              <TableCell className="font-medium">{m.email}</TableCell>
              <TableCell className="text-sm text-gray-600">{m.orcid_id ?? '—'}</TableCell>
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
                  disabled={revokingId === m.id}
                >
                  {revokingId === m.id ? 'Revoking…' : 'Revoke'}
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {members.length === 0 && (
        <p className="text-gray-500">No members yet. Add one above.</p>
      )}
    </div>
  )
}
