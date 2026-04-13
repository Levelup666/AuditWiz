'use client'

import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { toast } from '@/lib/toast'
import type { StudyRoleDefinitionRow } from '@/lib/supabase/study-roles'

const FLAG_META: { key: keyof Pick<
  StudyRoleDefinitionRow,
  | 'can_view'
  | 'can_comment'
  | 'can_review'
  | 'can_approve'
  | 'can_share'
  | 'can_manage_members'
  | 'can_edit_study_settings'
  | 'can_create_records'
  | 'can_moderate_record_status'
  | 'can_anchor_records'
  | 'can_access_audit_hub'
>; label: string }[] = [
  { key: 'can_view', label: 'View' },
  { key: 'can_comment', label: 'Comment' },
  { key: 'can_review', label: 'Review' },
  { key: 'can_approve', label: 'Approve' },
  { key: 'can_share', label: 'Share' },
  { key: 'can_manage_members', label: 'Manage members' },
  { key: 'can_edit_study_settings', label: 'Study settings' },
  { key: 'can_create_records', label: 'Create records' },
  { key: 'can_moderate_record_status', label: 'Moderate status' },
  { key: 'can_anchor_records', label: 'Anchor' },
  { key: 'can_access_audit_hub', label: 'Audit hub' },
]

function flagsSummary(r: StudyRoleDefinitionRow): string {
  return FLAG_META.filter((f) => r[f.key]).map((f) => f.label).join(', ') || '—'
}

type FlagState = Record<(typeof FLAG_META)[number]['key'], boolean>

function rowToFlags(r: StudyRoleDefinitionRow): FlagState {
  const o = {} as FlagState
  for (const f of FLAG_META) {
    o[f.key] = Boolean(r[f.key])
  }
  return o
}

export default function StudyRoleCatalog({
  studyId,
  onRolesMutated,
}: {
  studyId: string
  /** Parent can refresh role pickers after create/update */
  onRolesMutated?: () => void
}) {
  const [roles, setRoles] = useState<StudyRoleDefinitionRow[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  const [newSlug, setNewSlug] = useState('')
  const [newName, setNewName] = useState('')
  const [newFlags, setNewFlags] = useState<FlagState>(() => {
    const z = {} as FlagState
    for (const f of FLAG_META) z[f.key] = false
    z.can_view = true
    return z
  })

  const [editFlags, setEditFlags] = useState<FlagState | null>(null)
  const [editName, setEditName] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/studies/${studyId}/roles`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || res.statusText)
      setRoles(data.roles ?? [])
    } catch (e) {
      toast.error(
        'Could not load roles',
        e instanceof Error ? e.message : 'Request failed'
      )
      setRoles([])
    } finally {
      setLoading(false)
    }
  }, [studyId])

  useEffect(() => {
    load()
  }, [load])

  const startEdit = (r: StudyRoleDefinitionRow) => {
    setEditingId(r.id)
    setEditName(r.display_name)
    setEditFlags(rowToFlags(r))
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditFlags(null)
    setEditName('')
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      const res = await fetch(`/api/studies/${studyId}/roles`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug: newSlug.trim().toLowerCase(),
          display_name: newName.trim(),
          ...newFlags,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || res.statusText)
      toast.success('Custom role created')
      setNewSlug('')
      setNewName('')
      const z = {} as FlagState
      for (const f of FLAG_META) z[f.key] = false
      z.can_view = true
      setNewFlags(z)
      await load()
      onRolesMutated?.()
    } catch (err) {
      toast.error('Create failed', err instanceof Error ? err.message : 'Failed')
    } finally {
      setSaving(false)
    }
  }

  const handleSaveEdit = async (id: string) => {
    if (!editFlags) return
    setSaving(true)
    try {
      const res = await fetch(`/api/studies/${studyId}/roles`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id,
          display_name: editName.trim(),
          ...editFlags,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || res.statusText)
      toast.success('Role updated')
      cancelEdit()
      await load()
      onRolesMutated?.()
    } catch (err) {
      toast.error('Update failed', err instanceof Error ? err.message : 'Failed')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Roles</CardTitle>
          <CardDescription>Loading…</CardDescription>
        </CardHeader>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader className="pb-4">
        <CardTitle className="text-lg">Role catalog</CardTitle>
        <CardDescription>
          Built-in roles are fixed. Create custom roles with explicit capabilities; members can hold up to
          two roles, and effective access is the union of both.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-8">
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-left">
                <th className="p-2 font-medium">Name</th>
                <th className="p-2 font-medium">Slug</th>
                <th className="p-2 font-medium">Capabilities</th>
                <th className="p-2 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {roles.map((r) => (
                <tr key={r.id} className="border-b last:border-0 align-top">
                  <td className="p-2">
                    <div className="font-medium">{r.display_name}</div>
                    {r.is_system && (
                      <Badge variant="secondary" className="mt-1 text-xs font-normal">
                        Built-in
                      </Badge>
                    )}
                  </td>
                  <td className="p-2 font-mono text-xs text-muted-foreground">{r.slug}</td>
                  <td className="p-2 text-muted-foreground max-w-md">{flagsSummary(r)}</td>
                  <td className="p-2 text-right">
                    {!r.is_system && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => startEdit(r)}
                        disabled={saving}
                      >
                        Edit
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {editingId && editFlags && (
          <div className="rounded-lg border border-border p-4 space-y-4">
            <h3 className="text-sm font-semibold">Edit custom role</h3>
            <div className="space-y-2 max-w-md">
              <Label htmlFor="edit-role-name">Display name</Label>
              <Input
                id="edit-role-name"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                disabled={saving}
              />
            </div>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {FLAG_META.map((f) => (
                <label key={f.key} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-input"
                    checked={editFlags[f.key]}
                    onChange={(e) =>
                      setEditFlags((prev) =>
                        prev ? { ...prev, [f.key]: e.target.checked } : prev
                      )
                    }
                    disabled={saving}
                  />
                  {f.label}
                </label>
              ))}
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                onClick={() => handleSaveEdit(editingId)}
                disabled={saving || !editName.trim()}
              >
                {saving ? 'Saving…' : 'Save'}
              </Button>
              <Button type="button" variant="outline" onClick={cancelEdit} disabled={saving}>
                Cancel
              </Button>
            </div>
          </div>
        )}

        <form onSubmit={handleCreate} className="space-y-4 border-t pt-6">
          <h3 className="text-sm font-semibold">New custom role</h3>
          <div className="grid gap-4 sm:grid-cols-2 max-w-2xl">
            <div className="space-y-2">
              <Label htmlFor="new-role-slug">Slug</Label>
              <Input
                id="new-role-slug"
                value={newSlug}
                onChange={(e) => setNewSlug(e.target.value)}
                placeholder="e.g. data-coordinator"
                autoComplete="off"
                disabled={saving}
              />
              <p className="text-xs text-muted-foreground">
                Lowercase, hyphens allowed; must not match a built-in role slug.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-role-name">Display name</Label>
              <Input
                id="new-role-name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Shown in the member manager"
                disabled={saving}
              />
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 max-w-4xl">
            {FLAG_META.map((f) => (
              <label key={f.key} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-input"
                  checked={newFlags[f.key]}
                  onChange={(e) =>
                    setNewFlags((prev) => ({ ...prev, [f.key]: e.target.checked }))
                  }
                  disabled={saving}
                />
                {f.label}
              </label>
            ))}
          </div>
          <Button type="submit" disabled={saving || !newSlug.trim() || !newName.trim()}>
            {saving ? 'Creating…' : 'Create role'}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
