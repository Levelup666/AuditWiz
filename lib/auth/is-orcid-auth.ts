import { getOrcidOAuthProviderId } from '@/lib/auth/orcid-provider'

export function isOrcidProvider(provider: unknown): boolean {
  if (typeof provider !== 'string') return false
  const id = getOrcidOAuthProviderId()
  return provider === id || provider.startsWith('custom:orcid') || provider === 'orcid'
}

export function userSignedInViaOrcid(user: {
  app_metadata?: Record<string, unknown> | null
}): boolean {
  const meta = user.app_metadata ?? {}
  const primary = meta.provider
  const providers = Array.isArray(meta.providers) ? meta.providers : []
  if (isOrcidProvider(primary)) return true
  return providers.some(isOrcidProvider)
}

/** User has a password/email identity (signed up with email, not ORCID-only). */
export function hasEmailPasswordIdentity(user: {
  identities?: { provider: string }[] | null
}): boolean {
  return Boolean(user.identities?.some((i) => i.provider === 'email'))
}

/**
 * Account created through ORCID (no email/password identity) or email was locked from ORCID.
 */
export function isOrcidPrimaryAccount(
  user: {
    identities?: { provider: string }[] | null
    app_metadata?: Record<string, unknown> | null
  },
  profile?: { orcid_email_locked?: boolean | null } | null
): boolean {
  if (profile?.orcid_email_locked) return true
  if (hasEmailPasswordIdentity(user)) return false
  if (user.identities?.some((i) => isOrcidProvider(i.provider))) return true
  return userSignedInViaOrcid(user)
}

export function findOrcidAuthIdentity(user: {
  identities?: Array<{
    provider: string
    identity_id: string
    identity_data?: Record<string, unknown> | null
  }> | null
}) {
  const providerId = getOrcidOAuthProviderId()
  return user.identities?.find((i) => i.provider === providerId) ?? null
}
