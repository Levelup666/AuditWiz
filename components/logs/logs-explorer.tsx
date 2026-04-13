'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Download } from 'lucide-react'
import { AuditEventTimeline } from '@/components/audit/audit-event-timeline'

type StudyRow = { id: string; title: string; institution_id: string | null }

type OrgScope =
  | null
  | { kind: 'institution'; id: string }
  | { kind: 'no_institution' }

interface LogsExplorerProps {
  studies: StudyRow[]
  institutionNames: Record<string, string>
  initialStudyId?: string | null
  retentionDays: number
}

const ENTITY_TABS = [
  { value: 'all', label: 'All types', param: '' },
  { value: 'record', label: 'Records', param: 'record' },
  { value: 'study', label: 'Studies', param: 'study' },
  { value: 'document', label: 'Documents', param: 'document' },
  { value: 'signature', label: 'Signatures', param: 'signature' },
] as const

function buildLogsQuery(params: {
  main: 'study' | 'institution'
  studyId: string
  orgScope: OrgScope
}): string {
  const p = new URLSearchParams()
  if (params.main === 'study' && params.studyId) {
    p.set('studyId', params.studyId)
  } else if (params.main === 'institution' && params.orgScope?.kind === 'institution') {
    p.set('institutionId', params.orgScope.id)
  } else if (params.main === 'institution' && params.orgScope?.kind === 'no_institution') {
    p.set('noInstitution', '1')
  }
  return p.toString()
}

export default function LogsExplorer({
  studies,
  institutionNames,
  initialStudyId,
  retentionDays,
}: LogsExplorerProps) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const studyTitles = useMemo(
    () => Object.fromEntries(studies.map((s) => [s.id, s.title])),
    [studies]
  )

  const defaultStudy = studies[0]?.id ?? ''
  const [mainTab, setMainTab] = useState<'study' | 'institution'>('study')
  const [studyId, setStudyId] = useState(
    () =>
      initialStudyId && studies.some((s) => s.id === initialStudyId)
        ? initialStudyId
        : defaultStudy
  )
  const [orgScope, setOrgScope] = useState<OrgScope>(null)
  const [entityTab, setEntityTab] = useState<string>('all')

  const targetEntityType = useMemo(() => {
    const row = ENTITY_TABS.find((t) => t.value === entityTab)
    return row?.param ?? ''
  }, [entityTab])

  const [events, setEvents] = useState<Record<string, unknown>[]>([])
  const [actorEmails, setActorEmails] = useState<Record<string, string>>({})
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const replaceLogsUrl = useCallback(
    (next: { main: 'study' | 'institution'; studyId: string; orgScope: OrgScope }) => {
      const q = buildLogsQuery(next)
      router.replace(q ? `/logs?${q}` : '/logs', { scroll: false })
    },
    [router]
  )

  useEffect(() => {
    const spStudy = searchParams.get('studyId')
    const spInst = searchParams.get('institutionId')
    const spNoInst = searchParams.get('noInstitution')
    if (spStudy && studies.some((s) => s.id === spStudy)) {
      setMainTab('study')
      setStudyId(spStudy)
      setOrgScope(null)
    } else if (spInst) {
      setMainTab('institution')
      setOrgScope({ kind: 'institution', id: spInst })
    } else if (spNoInst === '1') {
      setMainTab('institution')
      setOrgScope({ kind: 'no_institution' })
    }
  }, [searchParams, studies])

  const fetchPage = useCallback(
    async (cursor: string | null, append: boolean) => {
      setLoading(true)
      setError(null)
      try {
        const params = new URLSearchParams()
        if (targetEntityType) params.set('targetEntityType', targetEntityType)
        if (cursor) params.set('cursor', cursor)
        if (mainTab === 'study' && studyId) {
          params.set('studyId', studyId)
        } else if (mainTab === 'institution' && orgScope?.kind === 'institution') {
          params.set('institutionId', orgScope.id)
        } else if (mainTab === 'institution' && orgScope?.kind === 'no_institution') {
          params.set('noInstitution', 'true')
        } else {
          setLoading(false)
          return
        }

        const res = await fetch(`/api/audit/events?${params.toString()}`)
        const json = await res.json().catch(() => ({}))
        if (!res.ok) {
          throw new Error((json as { error?: string }).error || 'Failed to load')
        }
        const payload = json as {
          events: Record<string, unknown>[]
          actorEmails?: Record<string, string>
          nextCursorEncoded?: string | null
        }
        setEvents((prev) =>
          append ? [...prev, ...payload.events] : payload.events
        )
        setActorEmails((prev) => ({
          ...prev,
          ...(payload.actorEmails ?? {}),
        }))
        setNextCursor(payload.nextCursorEncoded ?? null)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load')
        if (!append) setEvents([])
        setNextCursor(null)
      } finally {
        setLoading(false)
      }
    },
    [mainTab, orgScope, studyId, targetEntityType]
  )

  useEffect(() => {
    setEvents([])
    setActorEmails({})
    setNextCursor(null)
    const canRun =
      mainTab === 'study'
        ? Boolean(studyId)
        : orgScope !== null
    if (!canRun) return
    void fetchPage(null, false)
  }, [mainTab, studyId, orgScope, targetEntityType, fetchPage])

  const groupedByInstitution = useMemo(() => {
    const map = new Map<string | null, StudyRow[]>()
    for (const s of studies) {
      const k = s.institution_id
      const list = map.get(k) ?? []
      list.push(s)
      map.set(k, list)
    }
    return map
  }, [studies])

  const exportHref = useMemo(() => {
    const p = new URLSearchParams({ format: 'csv' })
    if (mainTab === 'study' && studyId) p.set('studyId', studyId)
    return `/api/audit/export?${p.toString()}`
  }, [mainTab, studyId])

  if (studies.length === 0) {
    return null
  }

  const entityTabsRow = (
    <Tabs
      key={`entity-${mainTab}`}
      value={entityTab}
      onValueChange={setEntityTab}
    >
      <TabsList className="h-auto flex-wrap justify-start">
        {ENTITY_TABS.map((t) => (
          <TabsTrigger key={t.value} value={t.value}>
            {t.label}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  )

  const timelineBlock = (
    <>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <div className="max-h-[min(32rem,70vh)] overflow-y-auto rounded-lg border border-border bg-card p-4">
        <AuditEventTimeline
          events={events}
          actorEmails={actorEmails}
          context={{ kind: 'hub', studyTitles }}
        />
      </div>
      <div className="flex items-center gap-2">
        {nextCursor ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={loading}
            onClick={() => void fetchPage(nextCursor, true)}
          >
            {loading ? 'Loading…' : 'Load more'}
          </Button>
        ) : null}
        {!loading && events.length === 0 ? (
          <span className="text-sm text-muted-foreground">No events in this view.</span>
        ) : null}
      </div>
    </>
  )

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Logs</h1>
          <p className="mt-2 text-gray-600">
            Audit activity for studies where you are an auditor or admin. Events older than{' '}
            {retentionDays} days are hidden from the app but remain in the database.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-4">
          <Link href={exportHref} download>
            <Button variant="outline" size="sm">
              <Download className="mr-2 h-4 w-4" />
              Export CSV
            </Button>
          </Link>
        </div>
      </div>

      <Tabs
        value={mainTab}
        onValueChange={(v) => {
          const m = v as 'study' | 'institution'
          setMainTab(m)
          if (m === 'study') {
            setOrgScope(null)
            replaceLogsUrl({ main: 'study', studyId, orgScope: null })
          } else {
            router.replace('/logs', { scroll: false })
          }
        }}
        className="w-full"
      >
        <TabsList className="h-auto flex-wrap justify-start">
          <TabsTrigger value="study">By study</TabsTrigger>
          <TabsTrigger value="institution">By institution</TabsTrigger>
        </TabsList>

        <TabsContent value="study" className="space-y-4">
          <div className="flex flex-wrap items-end gap-4">
            <div>
              <Label htmlFor="logs-study" className="text-sm font-medium">
                Study
              </Label>
              <select
                id="logs-study"
                value={studyId}
                onChange={(e) => {
                  const v = e.target.value
                  setStudyId(v)
                  replaceLogsUrl({ main: 'study', studyId: v, orgScope: null })
                }}
                className="mt-1 block min-w-[12rem] rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                {studies.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.title}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {entityTabsRow}
          {timelineBlock}
        </TabsContent>

        <TabsContent value="institution" className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Expand an organization to open a study or load all logs for that organization (or for
            studies with no organization).
          </p>

          <div className="space-y-2">
            {Array.from(groupedByInstitution.entries()).map(([instId, list]) => {
              const label =
                instId && institutionNames[instId]
                  ? institutionNames[instId]
                  : 'No institution'
              const scope: OrgScope =
                instId === null
                  ? { kind: 'no_institution' }
                  : { kind: 'institution', id: instId }
              const selected =
                orgScope?.kind === 'no_institution' && instId === null
                  ? true
                  : orgScope?.kind === 'institution' && orgScope.id === instId

              return (
                <details
                  key={instId ?? 'none'}
                  className="rounded-lg border border-border bg-muted/20"
                >
                  <summary className="cursor-pointer list-none px-4 py-3 font-medium [&::-webkit-details-marker]:hidden">
                    {label}
                    <span className="ml-2 text-xs font-normal text-muted-foreground">
                      ({list.length} stud{list.length === 1 ? 'y' : 'ies'})
                    </span>
                  </summary>
                  <div className="border-t border-border space-y-2 px-4 py-3">
                    <Button
                      type="button"
                      variant={selected ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => {
                        setMainTab('institution')
                        setOrgScope(scope)
                        replaceLogsUrl({ main: 'institution', studyId, orgScope: scope })
                      }}
                    >
                      View all logs — {label}
                    </Button>
                    <ul className="space-y-1 text-sm">
                      {list.map((s) => (
                        <li key={s.id}>
                          <button
                            type="button"
                            className="text-primary hover:underline"
                            onClick={() => {
                              setMainTab('study')
                              setStudyId(s.id)
                              setOrgScope(null)
                              replaceLogsUrl({ main: 'study', studyId: s.id, orgScope: null })
                            }}
                          >
                            {s.title}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                </details>
              )
            })}
          </div>

          {orgScope !== null && mainTab === 'institution' ? (
            <>
              {entityTabsRow}
              {timelineBlock}
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              Choose &quot;View all logs&quot; for an organization to load events here.
            </p>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
