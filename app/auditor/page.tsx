import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { listActiveEngagementsForUser } from '@/lib/auditor/engagements'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Activity, Download, FolderOpen, ShieldCheck } from 'lucide-react'

export default async function AuditorLandingPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/auth/signin?redirectedFrom=/auditor')

  const engagements = await listActiveEngagementsForUser(supabase, user.id)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Audit engagements</h1>
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
              You have no active audit engagements. If you were emailed a link, open it in this
              browser to accept the engagement. Otherwise, ask the institution administrator to
              issue you one.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline">
              <Link href="/invites">Open invites</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {engagements.map((e) => {
            const scopeLabel =
              e.scope === 'institution_wide'
                ? 'Institution-wide'
                : `${e.studies.length} stud${e.studies.length === 1 ? 'y' : 'ies'}`
            const studyHrefs = e.studies
              .filter((s) => s.study_id)
              .map((s) => ({ id: s.study_id, title: s.study_title ?? '(untitled study)' }))
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
                    <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-800">
                      {scopeLabel}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <div className="text-xs text-muted-foreground">
                    Window: {new Date(e.starts_at).toLocaleDateString()} –{' '}
                    {new Date(e.expires_at).toLocaleString()}
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
                              href={`/studies/${s.id}`}
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
                    {e.scope === 'institution_wide' && (
                      <Button asChild size="sm" variant="outline">
                        <Link href={`/institutions/${e.institution_id}`}>
                          <FolderOpen className="mr-2 h-4 w-4" />
                          Open institution
                        </Link>
                      </Button>
                    )}
                    <Button asChild size="sm" variant="outline">
                      <Link href={`/logs`}>
                        <Activity className="mr-2 h-4 w-4" />
                        Audit logs
                      </Link>
                    </Button>
                    <Button asChild size="sm">
                      <a
                        href={`/api/auditor/engagements/${e.id}/evidence-pack?format=download`}
                      >
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
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">What you can do</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>
            <strong>Read records, signatures, and anchors</strong> for studies in scope. Open any
            study or record link from the cards above. The blue read-only banner reminds you of
            the scope.
          </p>
          <p>
            <strong>Inspect the audit log</strong> via the audit hub. Filter by study or
            institution; download CSV exports there for ad-hoc evidence.
          </p>
          <p>
            <strong>Download an evidence pack</strong> for a single engagement: studies, record
            manifests, signatures, anchors, and a hash-stamped manifest.
          </p>
          <p>
            <strong>What you cannot do:</strong> edit, sign, approve, anchor, or change
            membership. All of your access (page views, exports) is recorded in the immutable
            audit ledger.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
