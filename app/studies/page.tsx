import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { Plus } from 'lucide-react'
import StudiesList from '@/components/studies/studies-list'
import { canUserCreateStudy } from '@/lib/supabase/permissions'

interface StudiesPageProps {
  searchParams: Promise<{ status?: string; institution?: string }>
}

export default async function StudiesPage({ searchParams }: StudiesPageProps) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return null
  }

  const sp = await searchParams

  const showNewStudy = await canUserCreateStudy(user.id)

  const { data: institutionMembers } = await supabase
    .from('institution_members')
    .select('institution_id')
    .eq('user_id', user.id)
    .is('revoked_at', null)

  const institutionIds = [...new Set((institutionMembers ?? []).map((m) => m.institution_id))]
  const { data: institutions } =
    institutionIds.length > 0
      ? await supabase
          .from('institutions')
          .select('id, name')
          .in('id', institutionIds)
          .order('name')
      : { data: [] }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Studies</h1>
          <p className="mt-2 text-gray-600">
            Manage your research studies and records
          </p>
        </div>
        {showNewStudy ? (
          <Link href="/studies/new">
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              New Study
            </Button>
          </Link>
        ) : (
          <Button variant="outline" asChild>
            <Link href="/institutions">Institutions (admin required to create studies)</Link>
          </Button>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Your Studies</CardTitle>
          <CardDescription>
            Studies you have access to based on your role
          </CardDescription>
        </CardHeader>
        <CardContent>
          <StudiesList
            userId={user.id}
            statusFilter={sp?.status}
            institutionFilter={sp?.institution}
            institutions={institutions ?? []}
          />
        </CardContent>
      </Card>
    </div>
  )
}
