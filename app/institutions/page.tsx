import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { Plus, Building2 } from 'lucide-react'

export default async function InstitutionsPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return null
  }

  const { data: memberships } = await supabase
    .from('institution_members')
    .select(`
      id,
      role,
      institution:institutions(id, name, slug, description)
    `)
    .eq('user_id', user.id)
    .is('revoked_at', null)
    .order('granted_at', { ascending: false })

  const institutions = (memberships ?? []).map((m: any) => ({
    ...m.institution,
    role: m.role,
  }))

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Institutions</h1>
        <p className="mt-2 text-gray-600">
          Organizations you belong to. Create studies under an institution.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Your Institutions</CardTitle>
          <CardDescription>
            Institutions you are a member of. Admins can create studies and invite members.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!institutions || institutions.length === 0 ? (
            <div className="py-12 text-center">
              <Building2 className="mx-auto h-12 w-12 text-muted-foreground" />
              <p className="mt-4 text-muted-foreground">No institutions yet</p>
              <p className="mt-1 text-sm text-muted-foreground">
                You will be prompted to create one when signing up, or accept an invite.
              </p>
              <Button asChild className="mt-4">
                <Link href="/onboarding">
                  <Plus className="mr-2 h-4 w-4" />
                  Create Institution
                </Link>
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {institutions.map((inst: any) => (
                <div
                  key={inst.id}
                  className="flex items-center justify-between rounded-lg border p-4"
                >
                  <div>
                    <p className="font-medium">{inst.name}</p>
                    {inst.description && (
                      <p className="text-sm text-muted-foreground mt-1">{inst.description}</p>
                    )}
                    <p className="text-xs text-muted-foreground mt-1">Your role: {inst.role}</p>
                  </div>
                  <Button asChild variant="outline" size="sm">
                    <Link href={`/institutions/${inst.id}`}>View</Link>
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
