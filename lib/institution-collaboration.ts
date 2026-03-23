/**
 * Institution policy: whether study collaborators may exist without institution membership.
 * Stored in institutions.metadata.allow_external_collaborators (default true for backward compatibility).
 */

export const ALLOW_EXTERNAL_COLLABORATORS_KEY = 'allow_external_collaborators' as const

export function institutionAllowsExternalCollaborators(metadata: unknown): boolean {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return true
  }
  const v = (metadata as Record<string, unknown>)[ALLOW_EXTERNAL_COLLABORATORS_KEY]
  if (v === false || v === 'false') return false
  if (v === true || v === 'true') return true
  return true
}

export function parseAllowExternalFromForm(value: string | null | undefined): boolean {
  return value !== 'false' && value !== 'off' && value !== '0'
}
