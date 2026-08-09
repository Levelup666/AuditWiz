import Link from 'next/link'
import { redirect, notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getOwnedActiveEngagement } from '@/lib/auditor/assert-engagement-access'
import { isAuditorScopedToStudy } from '@/lib/auditor/engagements'
import AuditorAccessBeacon from '@/components/auditor/auditor-access-beacon'
import AuditorEngagementBanner from '@/components/auditor/auditor-engagement-banner'
import StudyDocumentationCard from '@/components/studies/study-documentation-card'
import StudyAuditTrail from '@/components/studies/study-audit-trail'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

interface PageProps {
  params: Promise<{ engagementId: string; studyId: string }>
}

export default async function AuditorStudyPage({ params }: PageProps) {
  const { engagementId, studyId } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    redirect(
      `/auth/signin?redirectedFrom=${encodeURIComponent(`/auditor/engagements/${engagementId}/studies/${studyId}`)}`
    )
  }

  const engagement = await getOwnedActiveEngagement(supabase, user.id, engagementId)
  if (!engagement) notFound()

  const inScope = await isAuditorScopedToStudy(user.id, studyId)
  if (!inScope) notFound()

  const { data: study } = await supabase.from('studies').select('*').eq('id', studyId).single()
  if (!study) notFound()

  const { data: institution } = await supabase
    .from('institutions')
    .select('name')
    .eq('id', engagement.institution_id)
    .maybeSingle()

  const { data: records } = await supabase
    .from('records')
    .select('id, record_number, status, version, created_at, content_hash')
    .eq('study_id', studyId)
    .order('created_at', { ascending: false })

  return (
    <div className="space-y-6">
      <AuditorAccessBeacon engagementId={engagementId} surface="study" studyId={studyId} />
      <AuditorEngagementBanner
        institutionName={institution?.name ?? null}
        scopeLabel="Read-only audit review"
        startsAt={engagement.starts_at}
        expiresAt={engagement.expires_at}
        purpose={engagement.purpose}
        organizationName={engagement.auditor_organization_name}
        auditorTitle={engagement.auditor_title}
        referenceId={engagement.auditor_reference_id}
      />

      <div>
        <p className="text-sm text-muted-foreground">
          <Link href={`/auditor/engagements/${engagementId}`} className="hover:underline">
            ← Engagement
          </Link>
        </p>
        <h1 className="mt-2 text-3xl font-bold text-gray-900">{study.title}</h1>
        {study.description ? <p className="mt-2 text-gray-600">{study.description}</p> : null}
        <Badge variant="secondary" className="mt-2 capitalize">
          {study.status}
        </Badge>
      </div>

      <StudyDocumentationCard
        studyId={studyId}
        documentation={study.documentation ?? null}
        canEdit={false}
      />

      <Card>
        <CardHeader>
          <CardTitle>Records</CardTitle>
          <CardDescription>Read-only records in this study.</CardDescription>
        </CardHeader>
        <CardContent>
          {!records?.length ? (
            <p className="text-sm text-muted-foreground">No records in this study.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Record</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Version</TableHead>
                  <TableHead>Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {records.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>
                      <Link
                        href={`/auditor/engagements/${engagementId}/studies/${studyId}/records/${r.id}`}
                        className="text-primary hover:underline"
                      >
                        {r.record_number}
                      </Link>
                    </TableCell>
                    <TableCell className="capitalize">{r.status}</TableCell>
                    <TableCell>v{r.version}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(r.created_at).toLocaleString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <StudyAuditTrail studyId={studyId} />
    </div>
  )
}
