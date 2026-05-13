import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Pending institution email invites use a partial unique index (institution + lower(trim(email)))
 * while open. Expired rows still match that index, so re-inviting would hit 23505 unless we close
 * stale rows. Institution admins satisfy RLS for this update.
 */
export async function revokeExpiredPendingInstitutionEmailInvite(
  supabase: SupabaseClient,
  institutionId: string,
  emailTrim: string
): Promise<void> {
  const now = new Date().toISOString()
  await supabase
    .from('institution_invites')
    .update({ revoked_at: now })
    .eq('institution_id', institutionId)
    .ilike('email', emailTrim)
    .is('accepted_at', null)
    .is('revoked_at', null)
    .lte('expires_at', now)
}
