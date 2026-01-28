import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { FolderOpen, Activity, FileText } from 'lucide-react'

export default async function DashboardPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/auth/signin')
  }

  // Get some quick stats
  const { count: studiesCount } = await supabase
    .from('studies')
    .select('*', { count: 'exact', head: true })
    .eq('created_by', user.id)

  const { count: recordsCount } = await supabase
    .from('records')
    .select('*', { count: 'exact', head: true })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
        <p className="mt-2 text-gray-600">
          Overview of your research activities
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Studies</CardTitle>
            <FolderOpen className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{studiesCount || 0}</div>
            <p className="text-xs text-muted-foreground">
              Studies you created
            </p>
            <Link href="/studies" className="mt-4 block">
              <Button variant="outline" size="sm" className="w-full">
                View Studies
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
            <div className="text-2xl font-bold">{recordsCount || 0}</div>
            <p className="text-xs text-muted-foreground">
              Total records across all studies
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Audit Trail</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <CardDescription>
              View complete audit history
            </CardDescription>
            <Link href="/dashboard/audit-trail" className="mt-4 block">
              <Button variant="outline" size="sm" className="w-full">
                View Audit Trail
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Quick Actions</CardTitle>
          <CardDescription>
            Common tasks and navigation
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-4">
          <Link href="/studies">
            <Button>
              <FolderOpen className="mr-2 h-4 w-4" />
              View All Studies
            </Button>
          </Link>
          <Link href="/dashboard/audit-trail">
            <Button variant="outline">
              <Activity className="mr-2 h-4 w-4" />
              View Audit Trail
            </Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  )
}
