'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { toast } from '@/lib/toast'
import { emitNotificationsChanged } from '@/lib/notifications/events'
import type { Notification } from '@/lib/notifications'

function studyLink(metadata: Record<string, unknown>): string | null {
  const studyId = metadata.study_id
  if (typeof studyId === 'string' && studyId.length > 0) {
    return `/studies/${studyId}`
  }
  return null
}

interface NotificationsPageClientProps {
  notifications: Notification[]
  total: number
  unreadOnly: boolean
  page: number
  pageSize: number
  retentionDays: number
}

export default function NotificationsPageClient({
  notifications,
  total,
  unreadOnly,
  page,
  pageSize,
  retentionDays,
}: NotificationsPageClientProps) {
  const router = useRouter()
  const [markingId, setMarkingId] = useState<string | null>(null)
  const [markingAll, setMarkingAll] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(() => new Set())
  const [clearOpen, setClearOpen] = useState(false)
  const [clearing, setClearing] = useState(false)

  const visible = notifications.filter((n) => !hiddenIds.has(n.id))
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const unreadCount = visible.filter((n) => !n.read_at).length

  const pageHref = (targetPage: number) => {
    const params = new URLSearchParams()
    if (unreadOnly) params.set('filter', 'unread')
    if (targetPage > 1) params.set('page', String(targetPage))
    const q = params.toString()
    return q ? `/notifications?${q}` : '/notifications'
  }

  const markAsRead = async (id: string) => {
    setMarkingId(id)
    try {
      await fetch(`/api/notifications/${id}/read`, { method: 'POST' })
      emitNotificationsChanged()
      router.refresh()
    } finally {
      setMarkingId(null)
    }
  }

  const markAllRead = async () => {
    setMarkingAll(true)
    try {
      await fetch('/api/notifications/read-all', { method: 'POST' })
      emitNotificationsChanged()
      router.refresh()
    } finally {
      setMarkingAll(false)
    }
  }

  const deleteOne = async (id: string) => {
    setDeletingId(id)
    setHiddenIds((prev) => new Set(prev).add(id))
    try {
      const res = await fetch(`/api/notifications/${id}`, { method: 'DELETE' })
      if (!res.ok && res.status !== 404) {
        const data = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(data.error || res.statusText)
      }
      emitNotificationsChanged()
      const remaining = visible.filter((n) => n.id !== id).length
      if (remaining === 0 && page > 1) {
        router.push(pageHref(page - 1))
      }
      router.refresh()
    } catch (e) {
      setHiddenIds((prev) => {
        const next = new Set(prev)
        next.delete(id)
        return next
      })
      toast.error('Could not clear notification', e instanceof Error ? e.message : undefined)
    } finally {
      setDeletingId(null)
    }
  }

  const clearAll = async () => {
    setClearing(true)
    try {
      const res = await fetch('/api/notifications/clear-all', { method: 'DELETE' })
      const data = (await res.json().catch(() => ({}))) as { error?: string; deleted?: number }
      if (!res.ok) throw new Error(data.error || res.statusText)
      setClearOpen(false)
      emitNotificationsChanged()
      toast.success(
        data.deleted === 1 ? '1 notification cleared' : `${data.deleted ?? 0} notifications cleared`
      )
      router.push(unreadOnly ? '/notifications?filter=unread' : '/notifications')
      router.refresh()
    } catch (e) {
      toast.error('Could not clear notifications', e instanceof Error ? e.message : undefined)
    } finally {
      setClearing(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button variant={unreadOnly ? 'outline' : 'default'} size="sm" asChild>
            <Link href="/notifications">All</Link>
          </Button>
          <Button variant={unreadOnly ? 'default' : 'outline'} size="sm" asChild>
            <Link href="/notifications?filter=unread">Unread</Link>
          </Button>
        </div>
        <div className="flex items-center gap-2">
          {unreadCount > 0 && (
            <Button variant="outline" size="sm" onClick={() => void markAllRead()} disabled={markingAll}>
              {markingAll ? 'Marking…' : 'Mark all read'}
            </Button>
          )}
          {total > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setClearOpen(true)}
              className="text-destructive hover:text-destructive"
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Clear all
            </Button>
          )}
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Notifications are deleted automatically after {retentionDays} days.
      </p>

      {visible.length === 0 ? (
        <div className="rounded-lg border py-12 text-center">
          <p className="text-muted-foreground">
            {unreadOnly ? 'No unread notifications.' : 'No notifications yet.'}
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            Personal alerts about tasks and study membership appear here. For a full forensic history, see{' '}
            <Link href="/logs" className="text-primary underline-offset-4 hover:underline">
              audit logs
            </Link>
            .
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {visible.map((n) => {
            const href = studyLink(n.metadata ?? {})
            return (
              <li
                key={n.id}
                className={`rounded-lg border p-4 text-sm ${
                  n.read_at ? 'bg-muted/30 opacity-80' : 'bg-background'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium">{n.title}</p>
                    {n.body ? <p className="mt-1 text-muted-foreground">{n.body}</p> : null}
                    <p className="mt-2 text-xs text-muted-foreground">
                      {new Date(n.created_at).toLocaleString()}
                    </p>
                    {href ? (
                      <Link
                        href={href}
                        className="mt-2 inline-block text-xs text-primary underline-offset-4 hover:underline"
                      >
                        Open study
                      </Link>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    {!n.read_at && (
                      <button
                        type="button"
                        onClick={() => void markAsRead(n.id)}
                        disabled={markingId === n.id}
                        className="text-xs text-primary hover:underline"
                      >
                        {markingId === n.id ? 'Marking…' : 'Mark read'}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => void deleteOne(n.id)}
                      disabled={deletingId === n.id}
                      aria-label={`Clear notification: ${n.title}`}
                      title="Clear notification"
                      className="rounded-sm p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-destructive disabled:opacity-50"
                    >
                      <X className="h-4 w-4" aria-hidden />
                    </button>
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-2 text-sm text-muted-foreground">
          <span>
            Page {page} of {totalPages}
          </span>
          <div className="flex gap-2">
            {page > 1 && (
              <Button variant="outline" size="sm" asChild>
                <Link href={pageHref(page - 1)}>Previous</Link>
              </Button>
            )}
            {page < totalPages && (
              <Button variant="outline" size="sm" asChild>
                <Link href={pageHref(page + 1)}>Next</Link>
              </Button>
            )}
          </div>
        </div>
      )}

      <Dialog open={clearOpen} onOpenChange={setClearOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Clear all notifications</DialogTitle>
            <DialogDescription>
              Permanently delete all of your notifications, read and unread. This cannot be undone. Audit logs
              are not affected.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setClearOpen(false)} disabled={clearing}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={() => void clearAll()} disabled={clearing}>
              {clearing ? 'Clearing…' : 'Clear all'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
