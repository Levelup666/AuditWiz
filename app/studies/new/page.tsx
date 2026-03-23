import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import NewStudyForm from '@/components/studies/new-study-form'
import { getInstitutionIdsWhereUserIsAdmin } from '@/lib/supabase/permissions'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

interface NewStudyPageProps {
  searchParams: Promise<{ institution?: string }>
}

export default async function NewStudyPage({ searchParams }: NewStudyPageProps) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/auth/signin')
  }

  const adminInstitutionIds = await getInstitutionIdsWhereUserIsAdmin(user.id)

  if (adminInstitutionIds.length === 0) {
    const { data: anyMembership } = await supabase
      .from('institution_members')
      .select('id')
      .eq('user_id', user.id)
      .is('revoked_at', null)
      .limit(1)
      .maybeSingle()

    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">New Study</h1>
          <p className="mt-2 text-gray-600">
            Only <strong>institution administrators</strong> can create studies. Studies must belong
            to an institution you administer.
          </p>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Cannot create a study yet</CardTitle>
            <CardDescription>
              {anyMembership
                ? 'You are a member of an institution but not an admin. Ask an institution admin to grant you admin access, or create your own institution via onboarding.'
                : 'Create an institution first (onboarding), then you will be its admin and can add studies.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {!anyMembership ? (
              <Button asChild>
                <Link href="/onboarding">Complete institution onboarding</Link>
              </Button>
            ) : null}
            <Button asChild variant={anyMembership ? 'default' : 'outline'}>
              <Link href="/institutions">View institutions</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/studies">Back to studies</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  const { data: institutions } = await supabase
    .from('institutions')
    .select('id, name, slug')
    .in('id', adminInstitutionIds)
    .order('name')

  const sp = await searchParams
  const rawPreselect = sp?.institution ?? null
  const preselectedInstitutionId =
    rawPreselect && adminInstitutionIds.includes(rawPreselect) ? rawPreselect : null

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">New Study</h1>
        <p className="mt-2 text-gray-600">
          Create a study under an institution you administer. You will be added as the study admin.
        </p>
      </div>
      <NewStudyForm
        institutions={institutions ?? []}
        preselectedInstitutionId={preselectedInstitutionId}
      />
    </div>
  )
}
