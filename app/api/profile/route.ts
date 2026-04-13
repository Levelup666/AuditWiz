import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select(
      'id, orcid_id, orcid_verified, orcid_affiliation_snapshot, display_name, first_name, last_name, nickname, created_at, updated_at'
    )
    .eq('id', user.id)
    .maybeSingle()

  if (profileError) {
    return NextResponse.json({ error: profileError.message }, { status: 500 })
  }

  const { data: identities } = await supabase
    .from('user_identities')
    .select('id, provider, provider_id, verified, linked_at')
    .eq('user_id', user.id)
    .is('revoked_at', null)

  return NextResponse.json({
    profile: profile ?? null,
    identities: identities ?? [],
    email: user.email,
  })
}
