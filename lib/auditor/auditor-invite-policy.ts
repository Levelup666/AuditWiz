/**
 * Institution policy for audit engagement invites.
 * Stored in institutions.metadata (defaults favor allowing existing external accounts).
 */

export const AUDITOR_INVITES_REQUIRE_FRESH_EMAIL_KEY =
  'auditor_invites_require_fresh_email' as const

export function institutionRequiresFreshEmailForAuditorInvites(metadata: unknown): boolean {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return false
  }
  const v = (metadata as Record<string, unknown>)[AUDITOR_INVITES_REQUIRE_FRESH_EMAIL_KEY]
  return v === true || v === 'true'
}

export function parseRequireFreshAuditorEmailFromForm(
  value: string | null | undefined
): boolean {
  return value === 'true' || value === 'on' || value === '1'
}
