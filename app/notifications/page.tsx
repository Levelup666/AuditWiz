import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { getNotificationsPage } from '@/lib/notifications'
import NotificationsPageClient from '@/components/notifications/notifications-page-client'
import { userIsAuditorPrimary } from '@/lib/auditor/is-auditor-primary'

interface NotificationsPageProps {
  searchParams: Promise<{ filter?: string; page?: string }>
}

const PAGE_SIZE = 20

export default async function NotificationsPage({ searchParams }: NotificationsPageProps) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/auth/signin')
  }

  if (await userIsAuditorPrimary(supabase, user.id)) {
    redirect('/auditor')
  }

  const sp = await searchParams
  const unreadOnly = sp?.filter === 'unread'
  const page = Math.max(1, parseInt(sp?.page ?? '1', 10) || 1)
  const offset = (page - 1) * PAGE_SIZE

  const { notifications, total } = await getNotificationsPage(user.id, {
    limit: PAGE_SIZE,
    offset,
    unreadOnly,
  })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Notifications</h1>
        <p className="mt-2 text-gray-600">
          Personal alerts about tasks and study membership. This is not the audit log.
        </p>
        <p className="mt-2 text-sm">
          <Link href="/logs" className="text-primary underline-offset-4 hover:underline">
            View audit logs
          </Link>
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Your updates</CardTitle>
          {/*<CardDescription>
            Task assignments, deadlines, new team members, and study membership changes that concern you.
          </CardDescription>*/}
        </CardHeader>
        <CardContent>
          <NotificationsPageClient
            notifications={notifications}
            total={total}
            unreadOnly={unreadOnly}
            page={page}
            pageSize={PAGE_SIZE}
          />
        </CardContent>
      </Card> 
    </div>
  )
}
