import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import NewStudyForm from '@/components/studies/new-study-form'

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
          .select('id, name, slug')
          .in('id', institutionIds)
          .order('name')
      : { data: [] }

  const sp = await searchParams
  const preselectedInstitutionId = sp?.institution ?? null

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">New Study</h1>
        <p className="mt-2 text-gray-600">
          Create a new research study. You will be added as the study admin.
        </p>
      </div>
      <NewStudyForm
        institutions={institutions ?? []}
        preselectedInstitutionId={preselectedInstitutionId}
      />
    </div>
  )
}
