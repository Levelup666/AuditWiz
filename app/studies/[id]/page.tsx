import { createClient } from '@/lib/supabase/server'
import { notFound, redirect } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import RecordsList from '@/components/records/records-list'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { Plus, Settings } from 'lucide-react'
import { canCreateRecord, getStudyMemberPermissions } from '@/lib/supabase/permissions'
import StudyMembersRosterDialog from '@/components/studies/study-members-roster-dialog'
import LeaveStudyButton from '@/components/studies/leave-study-button'
import { getStudyLeaveEligibility } from '@/lib/study-leave-eligibility'
import { getActiveEngagementForStudy } from '@/lib/auditor/engagement-for-study'
import {
  auditorStudyPath,
  shouldUseAuditorReviewRoutes,
} from '@/lib/auditor/auditor-review-routes'
import { Badge } from '@/components/ui/badge'
import StudyDocumentationCard from '@/components/studies/study-documentation-card'
import StudyTasksSection from '@/components/studies/study-tasks-section'
import StudyAuditTrail from '@/components/studies/study-audit-trail'
import { StudyContextHints } from '@/components/studies/study-scope-provider'
import { StudyCreatedNotice } from '@/components/studies/study-created-notice'
import { Suspense } from 'react'

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

  const perms = await getStudyMemberPermissions(user.id, id)
  const canViewStudy = Boolean(perms?.can_view)
  const canManageMembers = Boolean(perms?.can_manage_members)
  const engagementContext = await getActiveEngagementForStudy(supabase, user.id, id)

  if (engagementContext && (await shouldUseAuditorReviewRoutes(supabase, user.id))) {
    redirect(auditorStudyPath(engagementContext.engagementId, id))
  }

  const engagementOnly = Boolean(engagementContext) && !canViewStudy

  const canCreate = engagementOnly ? false : await canCreateRecord(user.id, id)

  const { data: activeMemberRows } = canViewStudy
    ? await supabase
        .from('study_members')
        .select('id, user_id, role')
        .eq('study_id', id)
        .is('revoked_at', null)
    : { data: [] as Array<{ id: string; user_id: string; role: string }> }

  const leaveEligibility = getStudyLeaveEligibility(user.id, activeMemberRows ?? [])

  const studyIsActive = study.status === 'active'

  return (
    <div className="space-y-6">
      <Suspense fallback={null}>
        <StudyCreatedNotice />
      </Suspense>
      {!studyIsActive && (
        <div
          className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
          role="status"
        >
          This study is <span className="font-medium capitalize">{study.status}</span> and cannot be
          edited.
        </div>
      )}
      <StudyContextHints />
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
        <div className="flex flex-wrap items-center justify-end gap-2">
          {canViewStudy && (
            <>
              <StudyMembersRosterDialog
                studyId={id}
                studyTitle={study.title}
                buttonSize="default"
              />
              <LeaveStudyButton
                studyId={id}
                studyTitle={study.title}
                disabledReason={leaveEligibility.disabledReason}
              />
            </>
          )}
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
        canEdit={canCreate && studyIsActive}
      />

      {!engagementOnly ? (
        <StudyTasksSection
          studyId={id}
          userId={user.id}
          canManageMembers={canManageMembers}
          canCreateRecords={canCreate}
          studyIsActive={studyIsActive}
        />
      ) : null}

      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-semibold">Records</h2>
        {canCreate && studyIsActive && (
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
            {engagementOnly
              ? 'Read-only records in your audit engagement scope.'
              : 'Immutable records with version history. Use "Amend" to create new versions.'}
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
