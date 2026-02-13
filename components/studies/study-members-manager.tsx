'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
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

interface Member {
  id: string
  user_id: string
  role: string
  granted_at: string
  granted_by: string | null
  email: string
}

interface StudyMembersManagerProps {
  studyId: string
}

export default function StudyMembersManager({ studyId }: StudyMembersManagerProps) {
  const [members, setMembers] = useState<Member[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('reviewer')
  const [addLoading, setAddLoading] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)
  const [revokingId, setRevokingId] = useState<string | null>(null)

  const fetchMembers = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/studies/${studyId}/members`)
      if (!res.ok) throw new Error(await res.json().then((b) => b.error || res.statusText))
      const data = await res.json()
      setMembers(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load members')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchMembers()
  }, [studyId])

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    setAddError(null)
    if (!email.trim()) return
    setAddLoading(true)
    try {
      const res = await fetch(`/api/studies/${studyId}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), role }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || res.statusText)
      setEmail('')
      setRole('reviewer')
      fetchMembers()
    } catch (e) {
      setAddError(e instanceof Error ? e.message : 'Failed to add member')
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
      fetchMembers()
    } catch {
      setError('Failed to revoke member')
    } finally {
      setRevokingId(null)
    }
  }

  if (loading) {
    return <p className="text-gray-500">Loading members…</p>
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-md bg-red-50 p-3">
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}

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
        {addError && (
          <p className="text-sm text-red-600 w-full">{addError}</p>
        )}
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
          {members.map((m) => (
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
