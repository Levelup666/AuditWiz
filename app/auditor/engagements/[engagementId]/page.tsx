import Link from 'next/link'
import { redirect, notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getOwnedActiveEngagement } from '@/lib/auditor/assert-engagement-access'
import AuditorAccessBeacon from '@/components/auditor/auditor-access-beacon'
import AuditorEngagementBanner from '@/components/auditor/auditor-engagement-banner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Download, FolderOpen } from 'lucide-react'

interface PageProps {
  params: Promise<{ engagementId: string }>
}

export default async function AuditorEngagementDetailPage({ params }: PageProps) {
  const { engagementId } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect(`/auth/signin?redirectedFrom=/auditor/engagements/${engagementId}`)

  const engagement = await getOwnedActiveEngagement(supabase, user.id, engagementId)
  if (!engagement) notFound()

  const { data: institution } = await supabase
    .from('institutions')
    .select('id, name')
    .eq('id', engagement.institution_id)
    .maybeSingle()

  let studies: Array<{ id: string; title: string; status: string | null }> = []
  if (engagement.scope === 'specific_studies') {
    const { data: links } = await supabase
      .from('audit_engagement_studies')
      .select('study_id, study:studies(id, title, status)')
      .eq('engagement_id', engagementId)
    studies = (links ?? []).map((row) => {
      const raw = row.study as
        | { id: string; title: string; status: string }
        | { id: string; title: string; status: string }[]
        | null
      const study = Array.isArray(raw) ? raw[0] ?? null : raw
      return {
        id: study?.id ?? row.study_id,
        title: study?.title ?? '(untitled study)',
        status: study?.status ?? null,
      }
    })
  } else {
    const { data } = await supabase
      .from('studies')
      .select('id, title, status')
      .eq('institution_id', engagement.institution_id)
      .order('title', { ascending: true })
    studies = (data ?? []).map((s) => ({
      id: s.id,
      title: s.title,
      status: s.status,
    }))
  }

  return (
    <div className="space-y-6">
      <AuditorAccessBeacon engagementId={engagementId} surface="auditor_hub" />
      <AuditorEngagementBanner
        institutionName={institution?.name ?? null}
        scopeLabel={
          engagement.scope === 'institution_wide' ? 'Institution-wide' : 'Specific studies'
        }
        startsAt={engagement.starts_at}
        expiresAt={engagement.expires_at}
        purpose={engagement.purpose}
        organizationName={engagement.auditor_organization_name}
        auditorTitle={engagement.auditor_title}
        referenceId={engagement.auditor_reference_id}
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">
            {institution?.name ?? 'Engagement'}
          </h1>
          <p className="mt-2 text-gray-600">
            Read-only review workspace for this audit engagement.
          </p>
        </div>
        <Button asChild>
          <a href={`/api/auditor/engagements/${engagementId}/evidence-pack`}>
            <Download className="mr-2 h-4 w-4" />
            Download evidence pack
          </a>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Trust artifacts</CardTitle>
          <CardDescription>Letter, credentials, and conflict declaration on file.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div>
            {engagement.engagement_letter_file_hash ? (
              <a
                className="text-primary hover:underline"
                href={`/api/auditor/engagements/${engagementId}/letter`}
              >
                {engagement.engagement_letter_file_name ?? 'Engagement letter.pdf'}
              </a>
            ) : (
              <span className="text-muted-foreground">No engagement letter on file</span>
            )}
          </div>
          <div className="text-xs text-muted-foreground">
            Attested as <strong>{engagement.auditor_organization_name ?? '—'}</strong>
            {engagement.coi_declared_at ? (
              <>
                {' · '}COI
                {engagement.coi_has_conflict ? ' (conflict disclosed)' : ' clear'}
              </>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FolderOpen className="h-5 w-5" aria-hidden />
            Studies in scope
          </CardTitle>
          <CardDescription>
            {studies.length === 0
              ? 'No studies currently visible under this engagement.'
              : `${studies.length} stud${studies.length === 1 ? 'y' : 'ies'} available for review.`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {studies.length === 0 ? null : (
            <ul className="space-y-2">
              {studies.map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-2">
                  <Link
                    href={`/auditor/engagements/${engagementId}/studies/${s.id}`}
                    className="text-primary hover:underline"
                  >
                    {s.title}
                  </Link>
                  {s.status ? (
                    <Badge variant="secondary" className="capitalize">
                      {s.status}
                    </Badge>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
