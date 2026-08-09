/**
 * Session mode for users who have both memberships and active audit engagements.
 * Cookie drives UI shell and server-side write sandbox (auditor context = read-only member APIs).
 */

export const ACTIVE_CONTEXT_COOKIE = 'auditwiz_active_context' as const

export type ActiveContext = 'auditor' | 'member'

export function parseActiveContext(raw: string | undefined | null): ActiveContext | null {
  if (raw === 'auditor' || raw === 'member') return raw
  return null
}

export function resolveActiveContext(opts: {
  auditorPrimary: boolean
  dualRole: boolean
  cookieValue?: string | null
}): ActiveContext | null {
  if (opts.auditorPrimary) return 'auditor'
  if (!opts.dualRole) return null
  return parseActiveContext(opts.cookieValue) ?? 'member'
}

/** True when the UI/shell should present the auditor-primary experience. */
export function shouldPresentAuditorShell(opts: {
  auditorPrimary: boolean
  dualRole: boolean
  activeContext: ActiveContext | null
}): boolean {
  if (opts.auditorPrimary) return true
  return opts.dualRole && opts.activeContext === 'auditor'
}
