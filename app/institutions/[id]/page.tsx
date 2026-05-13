import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { canManageInstitution, canManageStudyMembers } from '@/lib/supabase/permissions'
import { Users, Settings, FolderOpen, ShieldCheck } from 'lucide-react'
import { getInstitutionResearchFieldLabel } from '@/lib/institution-research-types'
import { institutionAllowsExternalCollaborators } from '@/lib/institution-collaboration'
import { AuditEventTimeline } from '@/components/audit/audit-event-timeline'
import { getActorEmailsForAudit } from '@/lib/audit/get-actor-emails'
import { SYSTEM_ACTOR_ID } from '@/lib/types'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveMemberDisplayName } from '@/lib/profile/resolve-member-display'

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function InstitutionDashboardPage({ params }: PageProps) {
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
    .select('*')
    .eq('id', id)
    .single()

  if (error || !institution) {
    notFound()
  }

  const isAdmin = await canManageInstitution(user.id, id)

  const researchFieldKey =
    institution.metadata &&
    typeof institution.metadata === 'object' &&
    !Array.isArray(institution.metadata) &&
    typeof (institution.metadata as { research_field?: string }).research_field === 'string'
      ? (institution.metadata as { research_field: string }).research_field
      : null
  const researchFieldLabel = getInstitutionResearchFieldLabel(researchFieldKey)
  const externalCollabAllowed = institutionAllowsExternalCollaborators(institution.metadata)

  // Studies: user must be study_member OR (institution_member AND study belongs to institution)
  // For dashboard we show institution's studies; user can only open those they're study_member of
  const { data: studies } = await supabase
    .from('studies')
    .select('id, title, status, updated_at')
    .eq('institution_id', id)
    .order('updated_at', { ascending: false })
  const studyTitles = Object.fromEntries((studies ?? []).map((s: any) => [s.id, s.title]))

  const studyIds = (studies ?? []).map((s: any) => s.id)
  const myStudyMembershipsResult =
    studyIds.length > 0
      ? await supabase
          .from('study_members')
          .select('study_id')
          .eq('user_id', user.id)
          .is('revoked_at', null)
          .in('study_id', studyIds)
      : { data: [] as { study_id: string }[] }
  const myStudyIds = new Set(
    (myStudyMembershipsResult.data ?? []).map((m) => m.study_id)
  )

  /** Institution admins may not be on every study; know if they can still open Study members. */
  const adminNonMemberStudyIds = isAdmin
    ? (studies ?? []).map((s: { id: string }) => s.id).filter((sid) => !myStudyIds.has(sid))
    : []
  const canManageStudyMembersById: Record<string, boolean> = {}
  if (adminNonMemberStudyIds.length > 0) {
    const flags = await Promise.all(
      adminNonMemberStudyIds.map(async (studyId) => ({
        studyId,
        can: await canManageStudyMembers(user.id, studyId),
      }))
    )
    for (const { studyId, can } of flags) {
      canManageStudyMembersById[studyId] = can
    }
  }

  const { data: institutionMembers, error: membersError } = await supabase
    .from('institution_members')
    .select('id, user_id, role, granted_at')
    .eq('institution_id', id)
    .is('revoked_at', null)
    .order('granted_at', { ascending: false })

  const memberRows = institutionMembers ?? []
  const memberUserIds = [...new Set(memberRows.map((m) => m.user_id))]
  const adminClient = createAdminClient()
  const memberEmailsByUserId: Record<string, string> = {}
  const memberMetadataByUserId: Record<string, Record<string, unknown> | undefined> = {}

  for (const memberUserId of memberUserIds) {
    try {
      const { data: authUser } = await adminClient.auth.admin.getUserById(memberUserId)
      if (authUser?.user?.email) {
        memberEmailsByUserId[memberUserId] = authUser.user.email
      }
      memberMetadataByUserId[memberUserId] = authUser?.user?.user_metadata as
        | Record<string, unknown>
        | undefined
    } catch {
      // Keep rendering robust even if auth lookup fails for one member.
    }
  }

  const { data: memberProfiles } =
    memberUserIds.length > 0
      ? await adminClient
          .from('profiles')
          .select('id, first_name, last_name, nickname, display_name')
          .in('id', memberUserIds)
      : { data: null as null }
  const profileByUser = new Map((memberProfiles ?? []).map((p) => [p.id, p]))

  const membersForDisplay = memberRows.map((m) => {
    const email = memberEmailsByUserId[m.user_id] ?? 'Email unavailable'
    const profile = profileByUser.get(m.user_id)
    return {
      id: m.id,
      user_id: m.user_id,
      email,
      display_name: resolveMemberDisplayName(profile, memberMetadataByUserId[m.user_id], email),
    }
  })

  const { data: institutionActivityEvents, error: activityError } = await supabase
    .from('audit_events')
    .select(
      'id, study_id, actor_id, actor_role_at_time, action_type, target_entity_type, target_entity_id, timestamp, metadata'
    )
    .contains('metadata', { institution_id: id })
    .order('timestamp', { ascending: false })
    .limit(25)

  const institutionActivity = activityError ? [] : (institutionActivityEvents ?? [])
  const actorIds = [
    ...new Set(
      institutionActivity
        .map((e) => e.actor_id as string | null)
        .filter((actorId): actorId is string => !!actorId && actorId !== SYSTEM_ACTOR_ID)
    ),
  ]
  const institutionActivityActorEmails = await getActorEmailsForAudit(actorIds)

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      draft: 'bg-gray-100 text-gray-800',
      active: 'bg-green-100 text-green-800',
      completed: 'bg-blue-100 text-blue-800',
      archived: 'bg-gray-100 text-gray-600',
    }
    return <Badge className={styles[status] || styles.draft}>{status}</Badge>
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">{institution.name}</h1>
          <div className="mt-2 flex flex-wrap gap-2">
            {researchFieldLabel && (
              <Badge variant="secondary" className="font-normal">
                {researchFieldLabel}
              </Badge>
            )}
            <Badge variant="outline" className="font-normal">
              {externalCollabAllowed
                ? 'External study collaborators allowed'
                : 'Institution members only on studies'}
            </Badge>
          </div>
          {institution.description && (
            <p className="mt-2 text-gray-600">{institution.description}</p>
          )}
        </div>
        {isAdmin && (
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline" size="sm">
              <Link href={`/institutions/${id}/members`}>
                <Users className="mr-2 h-4 w-4" />
                Members
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href={`/institutions/${id}/auditors`}>
                <ShieldCheck className="mr-2 h-4 w-4" />
                Auditors
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href={`/institutions/${id}/settings`}>
                <Settings className="mr-2 h-4 w-4" />
                Settings
              </Link>
            </Button>
            <Button asChild>
              <Link href={`/studies/new?institution=${id}`}>
                <FolderOpen className="mr-2 h-4 w-4" />
                New Study
              </Link>
            </Button>
          </div>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Studies</CardTitle>
          <CardDescription>
            Studies under this institution. You can only open studies you are a member of.
            {isAdmin && (
              <>
                {' '}
                As an institution admin, you may still see studies you did not join—use the actions
                below to get access or help others join.
              </>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!studies || studies.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">
              No studies yet.
              {isAdmin && (
                <Button asChild className="mt-2">
                  <Link href={`/studies/new?institution=${id}`}>Create first study</Link>
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              {studies.map((study: any) => {
                const canOpen = myStudyIds.has(study.id)
                const canManageThisStudy =
                  isAdmin && !canOpen && canManageStudyMembersById[study.id] === true
                return (
                  <div
                    key={study.id}
                    className="flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-start sm:justify-between"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">{study.title}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        {getStatusBadge(study.status)}
                        {!canOpen && !isAdmin && (
                          <span className="text-xs text-muted-foreground">
                            Not a member — ask a study lead to add you.
                          </span>
                        )}
                      </div>
                      {!canOpen && isAdmin && (
                        <div className="mt-2 space-y-1 text-xs leading-relaxed text-muted-foreground">
                          {canManageThisStudy ? (
                            <>
                              <p>
                                You administer this institution but are not on this study yet. Open
                                Study members to add yourself or invite others.
                              </p>
                            </>
                          ) : (
                            <p>
                              You administer this institution but are not on this study. A study
                              lead can add you from{' '}
                              <span className="font-medium text-foreground">Study members</span> on
                              that study, or coordinate access from{' '}
                              <Link
                                href={`/institutions/${id}/members`}
                                className="font-medium text-foreground underline-offset-4 hover:underline"
                              >
                                Institution members
                              </Link>
                              .
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                      {canOpen ? (
                        <Button asChild variant="outline" size="sm">
                          <Link href={`/studies/${study.id}`}>Open</Link>
                        </Button>
                      ) : canManageThisStudy ? (
                        <Button asChild variant="outline" size="sm">
                          <Link href={`/studies/${study.id}/members`}>Study members</Link>
                        </Button>
                      ) : isAdmin ? (
                        <Button asChild variant="ghost" size="sm">
                          <Link href={`/institutions/${id}/members`}>Institution members</Link>
                        </Button>
                      ) : (
                        <span className="text-sm text-muted-foreground">—</span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Institution members</CardTitle>
          <CardDescription>
            Active members for this institution, including you.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {membersError ? (
            <p className="text-sm text-destructive">Could not load institution members.</p>
          ) : membersForDisplay.length === 0 ? (
            <p className="text-sm text-muted-foreground">No active members found.</p>
          ) : (
            <div className="space-y-2">
              {membersForDisplay.map((member) => (
                <div
                  key={member.id}
                  className="flex items-center justify-between rounded-lg border p-3"
                >
                  <p className="font-medium">{member.display_name ?? member.email}</p>
                  <p className="text-sm text-muted-foreground">{member.email}</p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Activity for this institution</CardTitle>
          <CardDescription>
            Institution-scoped audit activity (for example invites, settings updates, and member changes)
            where event metadata includes this institution.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {activityError ? (
            <p className="text-sm text-destructive">Could not load institution activity.</p>
          ) : institutionActivity.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No institution activity events yet.
            </p>
          ) : (
            <div className="max-h-[min(32rem,70vh)] overflow-y-auto rounded-lg border border-border bg-card p-4">
              <AuditEventTimeline
                events={institutionActivity as unknown as Record<string, unknown>[]}
                actorEmails={institutionActivityActorEmails}
                context={{ kind: 'hub', studyTitles }}
              />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
