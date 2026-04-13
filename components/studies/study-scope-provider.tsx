'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import { Label } from '@/components/ui/label'

export type StudyScopeCaps = {
  can_review: boolean
  can_approve: boolean
  can_access_audit_hub: boolean
  can_manage_members: boolean
  can_create_records: boolean
}

export type StudyScopeInitial = {
  hasMembership: boolean
  roles: string[]
  caps: StudyScopeCaps | null
}

type StudyScopeContextValue = {
  studyId: string
  roles: string[]
  caps: StudyScopeCaps | null
  hasMembership: boolean
  actingAsSlug: string | null
  setActingAsSlug: (slug: string | null) => void
}

const StudyScopeContext = createContext<StudyScopeContextValue | null>(null)

function storageKey(studyId: string) {
  return `auditwiz-study-acting-${studyId}`
}

export default function StudyScopeProvider({
  studyId,
  initial,
  children,
}: {
  studyId: string
  initial: StudyScopeInitial
  children: React.ReactNode
}) {
  const defaultSlug = initial.roles[0] ?? null
  const [actingAsSlug, setActingAsSlugState] = useState<string | null>(defaultSlug)
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    if (!initial.hasMembership || initial.roles.length === 0) {
      setActingAsSlugState(null)
      setHydrated(true)
      return
    }
    try {
      const raw = localStorage.getItem(storageKey(studyId))
      if (raw && initial.roles.includes(raw)) {
        setActingAsSlugState(raw)
      } else {
        setActingAsSlugState(initial.roles[0] ?? null)
      }
    } catch {
      setActingAsSlugState(initial.roles[0] ?? null)
    }
    setHydrated(true)
  }, [studyId, initial.hasMembership, initial.roles])

  const setActingAsSlug = useCallback(
    (slug: string | null) => {
      setActingAsSlugState(slug)
      try {
        if (slug) {
          localStorage.setItem(storageKey(studyId), slug)
        } else {
          localStorage.removeItem(storageKey(studyId))
        }
      } catch {
        /* ignore */
      }
    },
    [studyId]
  )

  const value = useMemo<StudyScopeContextValue>(
    () => ({
      studyId,
      roles: initial.roles,
      caps: initial.caps,
      hasMembership: initial.hasMembership,
      actingAsSlug: hydrated ? actingAsSlug : defaultSlug,
      setActingAsSlug,
    }),
    [
      studyId,
      initial.roles,
      initial.caps,
      initial.hasMembership,
      hydrated,
      actingAsSlug,
      defaultSlug,
      setActingAsSlug,
    ]
  )

  return (
    <StudyScopeContext.Provider value={value}>{children}</StudyScopeContext.Provider>
  )
}

export function useStudyScope() {
  return useContext(StudyScopeContext)
}

export function StudyActingAsBar() {
  const ctx = useStudyScope()
  if (!ctx?.hasMembership || ctx.roles.length < 2) {
    return null
  }

  return (
    <div
      className="mb-4 flex flex-col gap-2 rounded-lg border border-border bg-muted/30 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
      role="region"
      aria-label="Study role focus"
    >
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
        <Label htmlFor="study-acting-as" className="text-sm font-medium shrink-0">
          Acting as
        </Label>
        <select
          id="study-acting-as"
          value={ctx.actingAsSlug ?? ctx.roles[0] ?? ''}
          onChange={(e) => ctx.setActingAsSlug(e.target.value || null)}
          className="rounded-md border border-input bg-background px-3 py-1.5 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring max-w-[220px]"
        >
          {ctx.roles.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      </div>
      <p className="text-xs text-muted-foreground max-w-xl leading-relaxed">
        This only changes emphasis in the UI. Access is still the union of every role assigned to you on
        this study.
      </p>
    </div>
  )
}

const SLUG_HINTS: Record<string, string> = {
  auditor:
    'Audit focus: open Logs in the sidebar for integrity events and verification tools.',
  reviewer: 'Review focus: work records in review and leave comments where needed.',
  approver: 'Approval focus: records awaiting your signature appear in the workflow.',
  creator: 'Authoring focus: drafts and study documentation are your main surfaces.',
  admin: 'Administration focus: members, settings, and study lifecycle controls.',
}

export function StudyContextHints() {
  const ctx = useStudyScope()
  if (!ctx?.hasMembership || !ctx.actingAsSlug) {
    return null
  }
  const text = SLUG_HINTS[ctx.actingAsSlug]
  if (!text) {
    return null
  }
  return (
    <p className="text-sm text-muted-foreground border-l-2 border-primary/40 pl-3 py-0.5 mb-2">
      {text}
    </p>
  )
}
