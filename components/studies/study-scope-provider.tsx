'use client'

import { createContext, useContext, useMemo } from 'react'

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
  /** Assigned role slug (one role per member per study). */
  roleSlug: string | null
  caps: StudyScopeCaps | null
  hasMembership: boolean
}

const StudyScopeContext = createContext<StudyScopeContextValue | null>(null)

export default function StudyScopeProvider({
  studyId,
  initial,
  children,
}: {
  studyId: string
  initial: StudyScopeInitial
  children: React.ReactNode
}) {
  const value = useMemo<StudyScopeContextValue>(
    () => ({
      studyId,
      roleSlug: initial.hasMembership ? (initial.roles[0] ?? null) : null,
      caps: initial.caps,
      hasMembership: initial.hasMembership,
    }),
    [studyId, initial.hasMembership, initial.roles, initial.caps]
  )

  return (
    <StudyScopeContext.Provider value={value}>{children}</StudyScopeContext.Provider>
  )
}

export function useStudyScope() {
  return useContext(StudyScopeContext)
}

const SLUG_HINTS: Record<string, string> = {
  auditor:
    'Audit focus: open Logs in the sidebar for integrity events and verification tools.',
  reviewer: 'Review focus: work records in review and leave comments where needed.',
  approver: 'Approval focus: records awaiting your signature appear in the workflow.',
  member: 'Contributor focus: drafts and study documentation are your main surfaces.',
  admin: 'Administration focus: members, settings, and study lifecycle controls.',
}

export function StudyContextHints() {
  const ctx = useStudyScope()
  if (!ctx?.hasMembership || !ctx.roleSlug) {
    return null
  }
  const text = SLUG_HINTS[ctx.roleSlug]
  if (!text) {
    return null
  }
  return (
    <p className="text-sm text-muted-foreground border-l-2 border-primary/40 pl-3 py-0.5 mb-2">
      {text}
    </p>
  )
}
