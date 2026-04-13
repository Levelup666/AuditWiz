import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { upsertProfileLegalNames } from '@/lib/profile/upsert-legal-names'

/**
 * After email-confirm or magic link, user_metadata may carry first_name/last_name from signup.
 * Upserts profiles row so onboarding can require names without re-entering when already in metadata.
 */
export async function POST() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const meta = user.user_metadata as Record<string, unknown> | undefined
  const fromMeta = (k: string) => {
    const v = meta?.[k]
    return typeof v === 'string' ? v.trim() : ''
  }
  const first = fromMeta('first_name')
  const last = fromMeta('last_name')
  if (!first || !last) {
    return NextResponse.json({ synced: false })
  }

  const { data: existing } = await supabase
    .from('profiles')
    .select('first_name, last_name')
    .eq('id', user.id)
    .maybeSingle()

  if (existing?.first_name?.trim() && existing?.last_name?.trim()) {
    return NextResponse.json({ synced: false, alreadyComplete: true })
  }

  const result = await upsertProfileLegalNames(supabase, user.id, first, last)
  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: 500 })
  }

  return NextResponse.json({ synced: true })
}
