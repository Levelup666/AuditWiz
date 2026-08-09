import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import {
  ACTIVE_CONTEXT_COOKIE,
  parseActiveContext,
} from '@/lib/auditor/active-context'

export const AUDITOR_CONTEXT_READONLY_CODE = 'auditor_context_readonly' as const

export type MemberWriteGuardResult =
  | { ok: true }
  | {
      ok: false
      status: 403
      error: string
      code: typeof AUDITOR_CONTEXT_READONLY_CODE
    }

/**
 * Dual-role sandbox: when the session cookie is `auditor`, member write paths must fail closed.
 * Cookie is the enforcement signal (set via POST /api/auditor/context).
 */
export function memberWritesBlockedByCookie(
  cookieValue: string | undefined | null
): boolean {
  return parseActiveContext(cookieValue) === 'auditor'
}

export async function assertMemberWritesAllowed(): Promise<MemberWriteGuardResult> {
  const jar = await cookies()
  if (!memberWritesBlockedByCookie(jar.get(ACTIVE_CONTEXT_COOKIE)?.value)) {
    return { ok: true }
  }
  return {
    ok: false,
    status: 403,
    error:
      'Switch to Member context to make changes. Auditor context is read-only.',
    code: AUDITOR_CONTEXT_READONLY_CODE,
  }
}

/** NextResponse JSON 403 when auditor context blocks writes; otherwise null. */
export async function memberWriteForbiddenResponse(): Promise<NextResponse | null> {
  const result = await assertMemberWritesAllowed()
  if (result.ok) return null
  return NextResponse.json(
    { error: result.error, code: result.code },
    { status: result.status }
  )
}

/**
 * Paths that remain writable (or are auditor-lane) even when active_context is auditor.
 * Matched as pathname prefix.
 */
export const AUDITOR_CONTEXT_WRITE_ALLOWLIST_PREFIXES = [
  '/api/auditor/',
  '/api/auth/',
  '/api/invites/',
  '/api/notifications/',
  '/api/profile/',
] as const

export function isAuditorContextWriteAllowedPath(pathname: string): boolean {
  return AUDITOR_CONTEXT_WRITE_ALLOWLIST_PREFIXES.some((p) => pathname.startsWith(p))
}

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

/**
 * Proxy/edge check: block mutating /api calls when auditor context cookie is set.
 * Does not hit the database — cookie is the sandbox switch.
 */
export function auditorContextBlocksApiWrite(
  method: string,
  pathname: string,
  cookieValue: string | undefined | null
): boolean {
  if (!MUTATING.has(method.toUpperCase())) return false
  if (!pathname.startsWith('/api/')) return false
  if (isAuditorContextWriteAllowedPath(pathname)) return false
  return memberWritesBlockedByCookie(cookieValue)
}
