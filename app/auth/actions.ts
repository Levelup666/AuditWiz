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

  return upsertProfileLegalNames(supabase, user.id, first_name, last_name)
}
