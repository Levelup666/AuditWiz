import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { canManageInstitution } from '@/lib/supabase/permissions'
import { Button } from '@/components/ui/button'
import InstitutionAuditorsManager from '@/components/institutions/institution-auditors-manager'
import { institutionRequiresFreshEmailForAuditorInvites } from '@/lib/auditor/auditor-invite-policy'

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function InstitutionAuditorsPage({ params }: PageProps) {
  const { id } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/auth/signin')

  const { data: institution } = await supabase
    .from('institutions')
    .select('id, name, metadata')
    .eq('id', id)
    .single()
  if (!institution) notFound()

  const allowed = await canManageInstitution(user.id, id)
  if (!allowed) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold">Audit engagements</h1>
        <p className="text-gray-600">You do not have permission to manage audit engagements.</p>
        <Button asChild variant="outline">
          <Link href={`/institutions/${id}`}>Back to institution</Link>
        </Button>
      </div>
    )
  }

  const { data: studyRows } = await supabase
    .from('studies')
    .select('id, title')
    .eq('institution_id', id)
    .order('title', { ascending: true })

  const studies = (studyRows ?? []).map((s) => ({ id: s.id, title: s.title }))

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Audit engagements</h1>
          <p className="mt-2 text-gray-600">
            {institution.name} – issue and manage time-boxed read-only audit access for executive
            staff and external auditors.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href={`/institutions/${id}`}>Back to institution</Link>
        </Button>
      </div>
      <InstitutionAuditorsManager
        institutionId={id}
        studies={studies}
        auditorInvitesRequireFreshEmail={institutionRequiresFreshEmailForAuditorInvites(
          institution.metadata
        )}
      />
    </div>
  )
}
