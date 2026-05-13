'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { toast } from '@/lib/toast'
import type { StudyTaskListItem } from '@/lib/study-tasks'
import {
  createStudyTask,
  updateStudyTask,
  cancelStudyTask,
} from '@/app/studies/[id]/tasks/actions'
import { ListTodo, Pencil, Plus, XCircle } from 'lucide-react'

type MemberOption = {
  user_id: string
  email: string
  member_display_name: string
}

interface StudyTasksPanelProps {
  studyId: string
  userId: string
  canManageMembers: boolean
  canCreateRecords: boolean
  studyIsActive: boolean
  initialTasks: StudyTaskListItem[]
}

function formatDue(dueAt: string | null) {
  if (!dueAt) return null
  try {
    return new Date(dueAt).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  } catch {
    return dueAt
  }
}

export default function StudyTasksPanel({
  studyId,
  userId,
  canManageMembers,
  canCreateRecords,
  studyIsActive,
  initialTasks,
}: StudyTasksPanelProps) {
  const router = useRouter()
  const [tasks, setTasks] = useState(initialTasks)
  const [members, setMembers] = useState<MemberOption[]>([])
  const [membersLoading, setMembersLoading] = useState(false)

  const [createOpen, setCreateOpen] = useState(false)
  const [editTask, setEditTask] = useState<StudyTaskListItem | null>(null)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [dueAt, setDueAt] = useState('')
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(() => new Set())
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setTasks(initialTasks)
  }, [initialTasks])

  const loadMembers = useCallback(async () => {
    setMembersLoading(true)
    try {
      const res = await fetch(`/api/studies/${studyId}/members`)
      if (!res.ok) {
        setMembers([])
        return
      }
      const data = (await res.json()) as { members?: MemberOption[] }
      setMembers(data.members ?? [])
    } catch {
      setMembers([])
    } finally {
      setMembersLoading(false)
    }
  }, [studyId])

  useEffect(() => {
    if ((createOpen || editTask) && canManageMembers) {
      void loadMembers()
    }
  }, [createOpen, editTask, canManageMembers, loadMembers])

  function openCreate() {
    setEditTask(null)
    setTitle('')
    setDescription('')
    setDueAt('')
    setSelectedUserIds(new Set())
    setCreateOpen(true)
  }

  function openEdit(task: StudyTaskListItem) {
    setCreateOpen(false)
    setEditTask(task)
    setTitle(task.title)
    setDescription(task.description ?? '')
    setDueAt(task.due_at ? task.due_at.slice(0, 10) : '')
    setSelectedUserIds(new Set(task.assignees.map((a) => a.user_id)))
  }

  function toggleAssignee(id: string) {
    setSelectedUserIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function handleSaveCreate() {
    setSaving(true)
    try {
      const result = await createStudyTask(studyId, {
        title,
        description: description.trim() || null,
        dueAt: dueAt.trim() || null,
        assigneeUserIds: [...selectedUserIds],
      })
      if (result.error) {
        toast.error('Could not create task', result.error)
        return
      }
      toast.success('Task created')
      setCreateOpen(false)
      router.refresh()
    } finally {
      setSaving(false)
    }
  }

  async function handleSaveEdit() {
    if (!editTask) return
    setSaving(true)
    try {
      const result = await updateStudyTask(studyId, editTask.id, {
        title,
        description: description.trim() || null,
        dueAt: dueAt.trim() || null,
        assigneeUserIds: [...selectedUserIds],
      })
      if (result.error) {
        toast.error('Could not update task', result.error)
        return
      }
      toast.success('Task updated')
      setEditTask(null)
      router.refresh()
    } finally {
      setSaving(false)
    }
  }

  async function handleCancelTask(taskId: string) {
    if (!confirm('Cancel this task? Assignees will no longer be asked to complete it.')) return
    const result = await cancelStudyTask(studyId, taskId)
    if (result.error) {
      toast.error('Could not cancel task', result.error)
      return
    }
    toast.success('Task cancelled')
    router.refresh()
  }

  const openTasks = tasks.filter((t) => t.status === 'open')
  const closedTasks = tasks.filter((t) => t.status !== 'open')

  return (
    <Card>
      <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <CardTitle className="flex items-center gap-2">
            <ListTodo className="h-5 w-5" />
            Study tasks
          </CardTitle>
          <CardDescription>
            Study leads assign work; completing a task requires creating a record so progress stays verifiable.
          </CardDescription>
        </div>
        {canManageMembers && studyIsActive && (
          <Button type="button" size="sm" onClick={openCreate}>
            <Plus className="mr-2 h-4 w-4" />
            New task
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-6">
        {openTasks.length === 0 && closedTasks.length === 0 && (
          <p className="text-sm text-muted-foreground">No tasks yet.</p>
        )}

        {openTasks.length > 0 && (
          <ul className="space-y-3">
            {openTasks.map((task) => {
              const isAssignee = task.assignees.some((a) => a.user_id === userId)
              const dueLabel = formatDue(task.due_at)
              return (
                <li
                  key={task.id}
                  className="rounded-lg border border-border bg-muted/20 px-4 py-3 text-sm"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-medium text-foreground">{task.title}</p>
                      {task.description && (
                        <p className="mt-1 text-muted-foreground whitespace-pre-wrap">{task.description}</p>
                      )}
                      <p className="mt-2 text-xs text-muted-foreground">
                        Assigned: {task.assignees.map((a) => a.label).join(', ') || '—'}
                        {dueLabel ? ` · Due ${dueLabel}` : ''}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {isAssignee && canCreateRecords && studyIsActive && (
                        <Button type="button" size="sm" asChild>
                          <Link href={`/studies/${studyId}/records/new?taskId=${task.id}`}>
                            Create record to complete
                          </Link>
                        </Button>
                      )}
                      {isAssignee && !canCreateRecords && (
                        <span className="text-xs text-amber-700 dark:text-amber-500">
                          You need record-creation permission to complete this task.
                        </span>
                      )}
                      {canManageMembers && studyIsActive && (
                        <>
                          <Button type="button" size="sm" variant="outline" onClick={() => openEdit(task)}>
                            <Pencil className="mr-1 h-3 w-3" />
                            Edit
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="text-destructive"
                            onClick={() => handleCancelTask(task.id)}
                          >
                            <XCircle className="mr-1 h-3 w-3" />
                            Cancel
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        )}

        {closedTasks.length > 0 && (
          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Completed & cancelled
            </p>
            <ul className="space-y-2">
              {closedTasks.map((task) => (
                <li
                  key={task.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border/60 px-3 py-2 text-sm opacity-90"
                >
                  <div>
                    <span className="font-medium">{task.title}</span>{' '}
                    <Badge variant="secondary" className="ml-1 font-normal capitalize">
                      {task.status}
                    </Badge>
                    {task.status === 'completed' && task.fulfilled_record_id && (
                      <span className="ml-2 text-xs text-muted-foreground">
                        <Link
                          href={`/studies/${studyId}/records/${task.fulfilled_record_id}`}
                          className="underline-offset-4 hover:underline"
                        >
                          View record
                        </Link>
                      </span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>New task</DialogTitle>
            <DialogDescription>Assign one or more study members. They complete it by creating a record.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="task-title">Title *</Label>
              <Input
                id="task-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="mt-1"
                placeholder="e.g. Submit protocol amendment"
              />
            </div>
            <div>
              <Label htmlFor="task-desc">Description</Label>
              <Textarea
                id="task-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="mt-1"
                rows={3}
              />
            </div>
            <div>
              <Label htmlFor="task-due">Due date</Label>
              <Input
                id="task-due"
                type="date"
                value={dueAt}
                onChange={(e) => setDueAt(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <Label>Assignees *</Label>
              <p className="mb-2 text-xs text-muted-foreground">Active study members only.</p>
              <div className="max-h-40 overflow-y-auto rounded-md border border-input p-2">
                {membersLoading ? (
                  <p className="text-xs text-muted-foreground">Loading members…</p>
                ) : members.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No members loaded.</p>
                ) : (
                  <ul className="space-y-2">
                    {members.map((m) => (
                      <li key={m.user_id} className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          id={`m-${m.user_id}`}
                          checked={selectedUserIds.has(m.user_id)}
                          onChange={() => toggleAssignee(m.user_id)}
                          className="h-4 w-4 rounded border-input"
                        />
                        <label htmlFor={`m-${m.user_id}`} className="cursor-pointer text-sm">
                          {m.member_display_name}
                          {m.email !== 'Email unavailable' && (
                            <span className="text-muted-foreground"> · {m.email}</span>
                          )}
                        </label>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
              Close
            </Button>
            <Button type="button" onClick={handleSaveCreate} disabled={saving || !title.trim() || selectedUserIds.size === 0}>
              {saving ? 'Saving…' : 'Create task'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editTask} onOpenChange={(o) => !o && setEditTask(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit task</DialogTitle>
            <DialogDescription>Only open tasks can be edited.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="edit-task-title">Title *</Label>
              <Input
                id="edit-task-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="edit-task-desc">Description</Label>
              <Textarea
                id="edit-task-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="mt-1"
                rows={3}
              />
            </div>
            <div>
              <Label htmlFor="edit-task-due">Due date</Label>
              <Input
                id="edit-task-due"
                type="date"
                value={dueAt}
                onChange={(e) => setDueAt(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <Label>Assignees *</Label>
              <div className="max-h-40 overflow-y-auto rounded-md border border-input p-2">
                {membersLoading ? (
                  <p className="text-xs text-muted-foreground">Loading members…</p>
                ) : members.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No members loaded.</p>
                ) : (
                  <ul className="space-y-2">
                    {members.map((m) => (
                      <li key={m.user_id} className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          id={`e-${m.user_id}`}
                          checked={selectedUserIds.has(m.user_id)}
                          onChange={() => toggleAssignee(m.user_id)}
                          className="h-4 w-4 rounded border-input"
                        />
                        <label htmlFor={`e-${m.user_id}`} className="cursor-pointer text-sm">
                          {m.member_display_name}
                          {m.email !== 'Email unavailable' && (
                            <span className="text-muted-foreground"> · {m.email}</span>
                          )}
                        </label>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setEditTask(null)}>
              Close
            </Button>
            <Button type="button" onClick={handleSaveEdit} disabled={saving || !title.trim() || selectedUserIds.size === 0}>
              {saving ? 'Saving…' : 'Save changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
