import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { Plus } from 'lucide-react'
import StudiesList from '@/components/studies/studies-list'

export default async function StudiesPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return null
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Studies</h1>
          <p className="mt-2 text-gray-600">
            Manage your research studies and records
          </p>
        </div>
        <Link href="/studies/new">
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            New Study
          </Button>
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Your Studies</CardTitle>
          <CardDescription>
            Studies you have access to based on your role
          </CardDescription>
        </CardHeader>
        <CardContent>
          <StudiesList userId={user.id} />
        </CardContent>
      </Card>
    </div>
  )
}
