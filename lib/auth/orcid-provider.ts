/**
 * Supabase custom OIDC provider identifier configured in the dashboard
 * (Auth → Providers → Custom → identifier such as `custom:orcid`).
 * @see https://supabase.com/docs/guides/auth/custom-oauth-providers
 */
export function getOrcidOAuthProviderId(): string {
  return (
    process.env.NEXT_PUBLIC_SUPABASE_ORCID_PROVIDER?.trim() ||
    'custom:orcid'
  )
}

/** True when ORCID Member API client credentials are configured (server-side read-limited). */
export function hasOrcidMemberApiCredentials(): boolean {
  return Boolean(
    process.env.ORCID_MEMBER_CLIENT_ID?.trim() &&
      process.env.ORCID_MEMBER_CLIENT_SECRET?.trim()
  )
}

/**
 * ORCID OAuth / OIDC scopes.
 * `openid` required; `email` when supported; `/read-limited` when Member API credentials exist.
 */
export function getOrcidOAuthScopes(): string {
  const base = 'openid email'
  if (hasOrcidMemberApiCredentials()) {
    return `${base} /read-limited`
  }
  return base
}

/** @deprecated Use getOrcidOAuthScopes() so Member API can extend scopes when configured. */
export const ORCID_OAUTH_SCOPES = getOrcidOAuthScopes()
