import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { syncVerifiedOrcidFromSession } from '@/lib/auth/sync-verified-orcid'

/**
 * Persists verified ORCID from Supabase Auth (custom OIDC provider) into public tables.
 * Called after `/auth/callback` exchanges the OAuth code so `user.identities` is populated.
 */
export async function POST() {
  const supabase = await createClient()
  const result = await syncVerifiedOrcidFromSession(supabase)

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }

  return NextResponse.json({
    linked: result.linked,
    orcidId: result.orcidId,
    reason: result.reason,
  })
}
