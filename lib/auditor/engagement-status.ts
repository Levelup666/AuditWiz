// Pure engagement status helpers — safe to import from Client Components.
// Server-only queries live in engagements.ts.

import type { AuditEngagement } from '@/lib/types'

export type EngagementStatus =
  | 'pending'
  | 'active'
  | 'expired'
  | 'revoked'

export function getEngagementStatus(
  e: Pick<AuditEngagement, 'accepted_at' | 'revoked_at' | 'starts_at' | 'expires_at'>,
  now: Date = new Date()
): EngagementStatus {
  if (e.revoked_at) return 'revoked'
  if (new Date(e.expires_at) <= now) return 'expired'
  if (!e.accepted_at) return 'pending'
  if (new Date(e.starts_at) > now) return 'pending'
  return 'active'
}

export function isEngagementUsable(
  e: Pick<AuditEngagement, 'accepted_at' | 'revoked_at' | 'starts_at' | 'expires_at'>,
  now: Date = new Date()
): boolean {
  return getEngagementStatus(e, now) === 'active'
}
