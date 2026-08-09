import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { listActiveEngagementsForUser } from '@/lib/auditor/engagements'
import { listEngagementScopedStudiesForUser } from '@/lib/auditor/list-engagement-studies'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Activity, Download, FolderOpen, ShieldCheck } from 'lucide-react'
import AuditorAccessBeacon from '@/components/auditor/auditor-access-beacon'

export default async function AuditorLandingPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/auth/signin?redirectedFrom=/auditor')

  const engagements = await listActiveEngagementsForUser(supabase, user.id)
  const scopedStudies = await listEngagementScopedStudiesForUser(supabase, user.id)

  const studyToEngagement = new Map<string, string>()
  for (const e of engagements) {
    if (e.scope === 'specific_studies') {
      for (const s of e.studies) {
        if (s.study_id) studyToEngagement.set(s.study_id, e.id)
      }
    } else {
      for (const s of scopedStudies) {
        if (s.institution_id === e.institution_id) {
          studyToEngagement.set(s.id, e.id)
        }
      }
    }
  }

  return (
    <div className="space-y-6">
      {engagements[0] ? (
        <AuditorAccessBeacon engagementId={engagements[0].id} surface="auditor_hub" />
      ) : null}
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Audit workspace</h1>
        <p className="mt-2 text-gray-600">
          Read-only audit grants issued to you. Each engagement is time-boxed and scoped to a
          specific institution (and optionally specific studies).
        </p>
      </div>

      {engagements.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>No active engagements</CardTitle>
            <CardDescription>
              You have no active audit engagements. If you were emailed an invitation, open that
              link in this browser or check <strong>Pending Invites</strong> after signing in.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 sm:flex-row">
            <Button asChild variant="outline">
              <Link href="/invites">Pending invites</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 lg:grid-cols-2">
            {engagements.map((e) => {
              const scopeLabel =
                e.scope === 'institution_wide'
                  ? 'Institution-wide'
                  : `${e.studies.length} stud${e.studies.length === 1 ? 'y' : 'ies'}`
              type StudyHref = { id: string; title: string }
              const studyHrefs: StudyHref[] = e.studies
                .filter((s: { study_id: string; study_title: string | null }) =>
                  Boolean(s.study_id)
                )
                .map((s: { study_id: string; study_title: string | null }) => ({
                  id: s.study_id,
                  title: s.study_title ?? '(untitled study)',
                }))
              return (
                <Card key={e.id} className="border-amber-200">
                  <CardHeader>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <CardTitle className="flex items-center gap-2">
                          <ShieldCheck className="h-5 w-5 text-amber-700" aria-hidden />
                          {e.institution_name ?? 'Institution'}
                        </CardTitle>
                        <CardDescription>
                          {e.purpose ? <span>{e.purpose}</span> : <span>No purpose recorded.</span>}
                        </CardDescription>
                      </div>
                      <Badge
                        variant="outline"
                        className="border-amber-300 bg-amber-50 text-amber-800"
                      >
                        {scopeLabel}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm">
                    <div className="text-xs text-muted-foreground">
                      Window: {new Date(e.starts_at).toLocaleDateString()} –{' '}
                      {new Date(e.expires_at).toLocaleString()}
                    </div>
                    {e.auditor_organization_name ? (
                      <div className="text-xs">
                        <span className="text-muted-foreground">Attested as </span>
                        <strong>{e.auditor_organization_name}</strong>
                        {e.auditor_title ? <> · {e.auditor_title}</> : null}
                        {e.auditor_reference_id ? (
                          <>
                            {' · '}
                            <span className="font-mono text-muted-foreground">
                              {e.auditor_reference_id}
                            </span>
                          </>
                        ) : null}
                      </div>
                    ) : null}
                    <div className="text-xs text-muted-foreground">
                      {e.engagement_letter_file_hash ? (
                        <a
                          className="text-primary hover:underline"
                          href={`/api/auditor/engagements/${e.id}/letter`}
                        >
                          Engagement letter
                        </a>
                      ) : (
                        <span>No engagement letter on file</span>
                      )}
                      {e.coi_declared_at ? (
                        <>
                          {' · '}
                          COI
                          {e.coi_has_conflict ? ' (conflict disclosed)' : ' clear'}
                        </>
                      ) : null}
                    </div>
                    {e.scope === 'specific_studies' && studyHrefs.length > 0 && (
                      <div>
                        <div className="text-xs font-medium text-muted-foreground">
                          Studies in scope
                        </div>
                        <ul className="mt-1 space-y-1">
                          {studyHrefs.slice(0, 5).map((s) => (
                            <li key={s.id} className="truncate">
                              <Link
                                href={`/auditor/engagements/${e.id}/studies/${s.id}`}
                                className="text-primary hover:underline"
                              >
                                {s.title}
                              </Link>
                            </li>
                          ))}
                          {studyHrefs.length > 5 && (
                            <li className="text-xs text-muted-foreground">
                              +{studyHrefs.length - 5} more
                            </li>
                          )}
                        </ul>
                      </div>
                    )}
                    <div className="flex flex-wrap gap-2 pt-2">
                      <Button asChild size="sm" variant="outline">
                        <Link href={`/auditor/engagements/${e.id}`}>Open engagement</Link>
                      </Button>
                      <Button asChild size="sm" variant="outline">
                        <Link href={`/logs`}>
                          <Activity className="mr-2 h-4 w-4" />
                          Audit logs
                        </Link>
                      </Button>
                      <Button asChild size="sm">
                        <a href={`/api/auditor/engagements/${e.id}/evidence-pack`}>
                          <Download className="mr-2 h-4 w-4" />
                          Evidence pack
                        </a>
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <FolderOpen className="h-5 w-5" aria-hidden />
                Studies in your audit scope
              </CardTitle>
              <CardDescription>
                These studies come from your active engagements—not from study membership. Open
                any study for read-only review.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {scopedStudies.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No studies are currently in scope (institution may have no studies yet, or your
                  window has not started).
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Study</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Open</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {scopedStudies.map((s) => {
                      const engagementId = studyToEngagement.get(s.id)
                      const href = engagementId
                        ? `/auditor/engagements/${engagementId}/studies/${s.id}`
                        : `/auditor`
                      return (
                      <TableRow key={s.id}>
                        <TableCell className="font-medium">{s.title}</TableCell>
                        <TableCell>
                          <Badge variant="secondary" className="font-normal capitalize">
                            {s.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button asChild size="sm" variant="outline">
                            <Link href={href}>View</Link>
                          </Button>
                        </TableCell>
                      </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">What you can do</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>
            <strong>Read records, signatures, and anchors</strong> for studies in scope from the
            auditor engagement pages.
          </p>
          <p>
            <strong>Inspect the audit log</strong> via Logs. Download CSV exports for ad-hoc
            evidence.
          </p>
          <p>
            <strong>Download an evidence pack</strong> for a single engagement: studies, record
            manifests, signatures, anchors, and a hash-stamped manifest.
          </p>
          <p>
            <strong>What you cannot do:</strong> edit, sign, approve, anchor, manage members, or
            change study tasks. Access and exports are recorded in the immutable audit ledger.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
