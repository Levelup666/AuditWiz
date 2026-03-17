import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import RecordsList from '@/components/records/records-list'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { Plus, Settings } from 'lucide-react'
import { canCreateRecord, canManageStudyMembers } from '@/lib/supabase/permissions'
import { Badge } from '@/components/ui/badge'
import StudyDocumentationCard from '@/components/studies/study-documentation-card'
import StudyAuditTrail from '@/components/studies/study-audit-trail'

interface StudyPageProps {
  params: Promise<{ id: string }>
  searchParams: Promise<{ status?: string; sort?: string }>
}

export default async function StudyPage({ params, searchParams }: StudyPageProps) {
  const { id } = await params
  const sp = await searchParams
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return null
  }

  // Fetch study
  const { data: study, error } = await supabase
    .from('studies')
    .select('*')
    .eq('id', id)
    .single()

  if (error || !study) {
    notFound()
  }

  // Check permissions
  const canCreate = await canCreateRecord(user.id, id)

  const canManageMembers = await canManageStudyMembers(user.id, id)

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">{study.title}</h1>
          <p className="mt-2 text-gray-600">{study.description}</p>
          {study.required_approval_count != null && study.required_approval_count > 1 && (
            <p className="mt-2 text-sm text-gray-500">
              <Badge variant="secondary" className="font-normal">
                {study.required_approval_count} approvals required
              </Badge>
            </p>
          )}
        </div>
        <div className="flex gap-2">
          {canManageMembers && (
            <>
              <Link href={`/studies/${id}/settings`}>
                <Button variant="outline">
                  <Settings className="mr-2 h-4 w-4" />
                  Settings
                </Button>
              </Link>
              <Link href={`/studies/${id}/members`}>
                <Button variant="outline">Manage Members</Button>
              </Link>
            </>
          )}
        </div>
      </div>

      <StudyDocumentationCard
        studyId={id}
        documentation={study.documentation ?? null}
        canEdit={canCreate}
      />

      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-semibold">Records</h2>
        {canCreate && (
          <Link href={`/studies/${id}/records/new`}>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Create Record
            </Button>
          </Link>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Study Records</CardTitle>
          <CardDescription>
            Immutable records with version history. Use "Amend" to create new versions.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <RecordsList studyId={id} statusFilter={sp?.status} sortBy={sp?.sort} />
        </CardContent>
      </Card>

      <StudyAuditTrail studyId={id} />
    </div>
  )
}
