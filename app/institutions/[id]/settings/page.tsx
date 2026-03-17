import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { canManageInstitution } from '@/lib/supabase/permissions'
import InstitutionSettingsForm from '@/components/institutions/institution-settings-form'

interface SettingsPageProps {
  params: Promise<{ id: string }>
}

export default async function InstitutionSettingsPage({ params }: SettingsPageProps) {
  const { id } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/auth/signin')
  }

  const { data: institution, error } = await supabase
    .from('institutions')
    .select('id, name, description, domain')
    .eq('id', id)
    .single()

  if (error || !institution) {
    notFound()
  }

  const canManage = await canManageInstitution(user.id, id)

  if (!canManage) {
    return (
      <div className="space-y-6">
        <p className="text-gray-500">You do not have permission to edit institution settings.</p>
        <Button asChild variant="outline">
          <Link href={`/institutions/${id}`}>Back to Institution</Link>
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Institution Settings</h1>
          <p className="mt-2 text-gray-600">
            Update institution details.
          </p>
        </div>
        <Link href={`/institutions/${id}`}>
          <Button variant="outline">Back to Institution</Button>
        </Link>
      </div>

      <InstitutionSettingsForm
        institutionId={id}
        initialData={{
          name: institution.name,
          description: institution.description ?? '',
          domain: institution.domain ?? '',
        }}
      />
    </div>
  )
}
