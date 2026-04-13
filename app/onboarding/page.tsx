import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import InstitutionForm from '@/components/onboarding/institution-form'

export default async function OnboardingPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/auth/signin')
  }

  const { data: members } = await supabase
    .from('institution_members')
    .select('id')
    .eq('user_id', user.id)
    .is('revoked_at', null)
    .limit(1)

  if (members && members.length > 0) {
    redirect('/studies')
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('first_name, last_name')
    .eq('id', user.id)
    .maybeSingle()

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-12 sm:px-6 lg:px-8">
      <div className="w-full max-w-xl space-y-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">
            Create your institution
          </h1>
          <p className="mt-2 text-gray-600">
            You represent an institution or research group. Create your institution to get started.
            You will be the administrator and can invite others, create studies, and delegate roles.
          </p>
        </div>
        <InstitutionForm
          initialFirstName={profile?.first_name ?? ''}
          initialLastName={profile?.last_name ?? ''}
        />
      </div>
    </div>
  )
}
