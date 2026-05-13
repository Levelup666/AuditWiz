import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { FolderOpen, FileText, ListTodo, Plus } from 'lucide-react'
import { getRecentNotifications } from '@/lib/notifications'
import NotificationsList from '@/components/dashboard/notifications-list'
import { canUserCreateStudy } from '@/lib/supabase/permissions'

export default async function DashboardPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/auth/signin')
  }
  const userId = user!.id

  const notifications = await getRecentNotifications(userId, 10)
  const showNewStudy = await canUserCreateStudy(userId)

  const { count: studiesCount } = await supabase
    .from('studies')
    .select('*', { count: 'exact', head: true })

  const { count: recordsCount } = await supabase
    .from('records')
    .select('*', { count: 'exact', head: true })

  const { count: myOpenTasksCount, error: openTasksCountError } = await supabase
    .from('study_tasks')
    .select('id, study_task_assignees!inner(user_id)', { count: 'exact', head: true })
    .eq('status', 'open')
    .eq('study_task_assignees.user_id', userId)

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
          <p className="mt-2 text-gray-600">
            Overview of your research activities
          </p>
          <p className="mt-2 text-sm">
            <Link href="/logs" className="text-primary underline-offset-4 hover:underline">
              View audit logs
            </Link>
          </p>
        </div>
        {showNewStudy && (
          <Button asChild>
            <Link href="/studies/new">
              <Plus className="mr-2 h-4 w-4" />
              New study
            </Link>
          </Button>
        )}
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Studies</CardTitle>
            <FolderOpen className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{studiesCount ?? 0}</div>
            <p className="text-xs text-muted-foreground">
              Studies you can access
            </p>
            <Link href="/studies" className="mt-4 block">
              <Button variant="outline" size="sm" className="w-full">
                View studies
              </Button>
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Records</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{recordsCount ?? 0}</div>
            <p className="text-xs text-muted-foreground">
              Records visible to you across studies
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">My open tasks</CardTitle>
            <ListTodo className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {openTasksCountError ? '—' : (myOpenTasksCount ?? 0)}
            </div>
            <p className="text-xs text-muted-foreground">
              Assigned to you in studies
            </p>
            <Link href="/studies" className="mt-4 block">
              <Button variant="outline" size="sm" className="w-full">
                Open a study
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>

      {notifications.length > 0 && (
        <NotificationsList notifications={notifications} />
      )}
    </div>
  )
}
