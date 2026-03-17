'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Bell } from 'lucide-react'

interface Notification {
  id: string
  type: string
  title: string
  body: string | null
  metadata: Record<string, unknown>
  read_at: string | null
  created_at: string
}

interface NotificationsListProps {
  notifications: Notification[]
}

export default function NotificationsList({ notifications }: NotificationsListProps) {
  const router = useRouter()
  const [markingId, setMarkingId] = useState<string | null>(null)

  const markAsRead = async (id: string) => {
    setMarkingId(id)
    try {
      await fetch(`/api/notifications/${id}/read`, { method: 'POST' })
      router.refresh()
    } finally {
      setMarkingId(null)
    }
  }

  if (!notifications || notifications.length === 0) {
    return null
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Bell className="h-4 w-4" />
          Notifications
        </CardTitle>
      </CardHeader>
      <CardContent>
        <CardDescription className="mb-4">
          {notifications.filter((n) => !n.read_at).length} unread
        </CardDescription>
        <ul className="space-y-3">
          {notifications.slice(0, 5).map((n) => (
            <li
              key={n.id}
              className={`rounded-lg border p-3 text-sm ${
                n.read_at ? 'bg-muted/30 opacity-75' : 'bg-background'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-medium">{n.title}</p>
                  {n.body && (
                    <p className="mt-1 text-muted-foreground">{n.body}</p>
                  )}
                  <p className="mt-1 text-xs text-muted-foreground">
                    {new Date(n.created_at).toLocaleString()}
                  </p>
                </div>
                {!n.read_at && (
                  <button
                    type="button"
                    onClick={() => markAsRead(n.id)}
                    disabled={markingId === n.id}
                    className="shrink-0 text-xs text-primary hover:underline"
                  >
                    {markingId === n.id ? 'Marking…' : 'Mark read'}
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}
