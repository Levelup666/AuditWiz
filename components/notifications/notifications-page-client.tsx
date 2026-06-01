'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
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
}

export default function NotificationsPageClient({
  notifications,
  total,
  unreadOnly,
  page,
  pageSize,
}: NotificationsPageClientProps) {
  const router = useRouter()
  const [markingId, setMarkingId] = useState<string | null>(null)
  const [markingAll, setMarkingAll] = useState(false)

  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const unreadCount = notifications.filter((n) => !n.read_at).length

  const markAsRead = async (id: string) => {
    setMarkingId(id)
    try {
      await fetch(`/api/notifications/${id}/read`, { method: 'POST' })
      router.refresh()
    } finally {
      setMarkingId(null)
    }
  }

  const markAllRead = async () => {
    setMarkingAll(true)
    try {
      await fetch('/api/notifications/read-all', { method: 'POST' })
      router.refresh()
    } finally {
      setMarkingAll(false)
    }
  }

  const filterHref = (nextUnreadOnly: boolean) => {
    const params = new URLSearchParams()
    if (nextUnreadOnly) params.set('filter', 'unread')
    if (page > 1) params.set('page', String(page))
    const q = params.toString()
    return q ? `/notifications?${q}` : '/notifications'
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button variant={unreadOnly ? 'outline' : 'default'} size="sm" asChild>
            <Link href={filterHref(false)}>All</Link>
          </Button>
          <Button variant={unreadOnly ? 'default' : 'outline'} size="sm" asChild>
            <Link href={filterHref(true)}>Unread</Link>
          </Button>
        </div>
        {unreadCount > 0 && (
          <Button variant="outline" size="sm" onClick={() => void markAllRead()} disabled={markingAll}>
            {markingAll ? 'Marking…' : 'Mark all read'}
          </Button>
        )}
      </div>

      {notifications.length === 0 ? (
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
          {notifications.map((n) => {
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
                  {!n.read_at && (
                    <button
                      type="button"
                      onClick={() => void markAsRead(n.id)}
                      disabled={markingId === n.id}
                      className="shrink-0 text-xs text-primary hover:underline"
                    >
                      {markingId === n.id ? 'Marking…' : 'Mark read'}
                    </button>
                  )}
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
                <Link
                  href={`/notifications?${unreadOnly ? 'filter=unread&' : ''}page=${page - 1}`}
                >
                  Previous
                </Link>
              </Button>
            )}
            {page < totalPages && (
              <Button variant="outline" size="sm" asChild>
                <Link
                  href={`/notifications?${unreadOnly ? 'filter=unread&' : ''}page=${page + 1}`}
                >
                  Next
                </Link>
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
