import { NextResponse } from 'next/server'

/**
 * Manual ORCID entry was removed in favor of verified ORCID via OAuth (Supabase custom OIDC).
 * Configure provider `NEXT_PUBLIC_SUPABASE_ORCID_PROVIDER` (default `custom:orcid`) in Supabase
 * and use Profile → "Continue with ORCID" or sign-in with ORCID.
 */
export async function POST() {
  return NextResponse.json(
    {
      error:
        'Manual ORCID linking is disabled. Use ORCID OAuth from your profile or the sign-in page.',
    },
    { status: 410 }
  )
}
