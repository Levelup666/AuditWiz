'use server'

import { createClient } from '@/lib/supabase/server'
import { upsertProfileLegalNames } from '@/lib/profile/upsert-legal-names'

export async function upsertProfileNamesAfterSignup(first_name: string, last_name: string) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'Not signed in' }
  }

  const nameRes = await upsertProfileLegalNames(supabase, user.id, first_name, last_name)
  if (nameRes.error) {
    return nameRes
  }

  const nowIso = new Date().toISOString()
  await supabase
    .from('profiles')
    .update({ password_last_changed_at: nowIso })
    .eq('id', user.id)

  return { error: null }
}
