import type { SupabaseClient } from '@supabase/supabase-js'
import { profileDisplayNameForDb } from '@/lib/profile/member-display-name'

export async function upsertProfileLegalNames(
  supabase: SupabaseClient,
  userId: string,
  firstRaw: string,
  lastRaw: string
): Promise<{ error?: string }> {
  const first_name = firstRaw.trim()
  const last_name = lastRaw.trim()
  if (!first_name || !last_name) {
    return { error: 'First name and last name are required' }
  }

  const { data: existing } = await supabase
    .from('profiles')
    .select('id, nickname')
    .eq('id', userId)
    .maybeSingle()

  const display_name = profileDisplayNameForDb({
    first_name,
    last_name,
    nickname: existing?.nickname,
  })

  const payload = {
    first_name,
    last_name,
    display_name,
    updated_at: new Date().toISOString(),
  }

  const { error } = existing
    ? await supabase.from('profiles').update(payload).eq('id', userId)
    : await supabase.from('profiles').insert({ id: userId, ...payload })

  if (error) {
    return { error: error.message }
  }
  return {}
}
