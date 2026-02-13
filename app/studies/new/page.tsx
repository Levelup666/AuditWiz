import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import NewStudyForm from '@/components/studies/new-study-form'

export default async function NewStudyPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/auth/signin')
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">New Study</h1>
        <p className="mt-2 text-gray-600">
          Create a new research study. You will be added as the study admin.
        </p>
      </div>
      <NewStudyForm />
    </div>
  )
}
