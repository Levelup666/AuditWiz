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

/** ORCID OAuth / OIDC scopes (openid required for userinfo + id_token). */
export const ORCID_OAUTH_SCOPES = 'openid'
