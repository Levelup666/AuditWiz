import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { canManageInstitution } from '@/lib/supabase/permissions'
import InstitutionMembersManager from '@/components/institutions/institution-members-manager'

interface MembersPageProps {
  params: Promise<{ id: string }>
}

export default async function InstitutionMembersPage({ params }: MembersPageProps) {
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
    .select('id, name')
    .eq('id', id)
    .single()

  if (error || !institution) {
    notFound()
  }

  const canManage = await canManageInstitution(user.id, id)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Institution Members</h1>
          <p className="mt-2 text-gray-600">
            {institution.name} – manage members and invite new users.
          </p>
        </div>
        <Link href={`/institutions/${id}`}>
          <Button variant="outline">Back to Institution</Button>
        </Link>
      </div>

      {canManage ? (
        <InstitutionMembersManager
          institutionId={id}
          currentUserId={user.id}
        />
      ) : (
        <p className="text-gray-500">You do not have permission to manage members.</p>
      )}
    </div>
  )
}
