import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { canManageInstitution } from '@/lib/supabase/permissions'
import { Users, Settings, FolderOpen } from 'lucide-react'
import { getInstitutionResearchFieldLabel } from '@/lib/institution-research-types'
import { institutionAllowsExternalCollaborators } from '@/lib/institution-collaboration'

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
          <div className="flex gap-2">
            <Button asChild variant="outline" size="sm">
              <Link href={`/institutions/${id}/members`}>
                <Users className="mr-2 h-4 w-4" />
                Members
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
                return (
                  <div
                    key={study.id}
                    className="flex items-center justify-between rounded-lg border p-3"
                  >
                    <div>
                      <p className="font-medium">{study.title}</p>
                      <div className="flex items-center gap-2 mt-1">
                        {getStatusBadge(study.status)}
                        {!canOpen && (
                          <span className="text-xs text-muted-foreground">
                            (Not a member — ask admin to add you)
                          </span>
                        )}
                      </div>
                    </div>
                    {canOpen ? (
                      <Button asChild variant="outline" size="sm">
                        <Link href={`/studies/${study.id}`}>Open</Link>
                      </Button>
                    ) : (
                      <span className="text-sm text-muted-foreground">—</span>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
