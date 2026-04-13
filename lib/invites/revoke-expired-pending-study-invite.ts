import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Open study email invites use a partial unique index (study + lower(email)) while pending.
 * Expired rows still match that index, so re-inviting the same email would hit 23505 unless we
 * close out stale rows. Study admins satisfy RLS for this update.
 */
export async function revokeExpiredPendingStudyEmailInvite(
  supabase: SupabaseClient,
  studyId: string,
  emailTrim: string
): Promise<void> {
  const now = new Date().toISOString()
  await supabase
    .from('study_member_invites')
    .update({ revoked_at: now })
    .eq('study_id', studyId)
    .ilike('email', emailTrim)
    .is('accepted_at', null)
    .is('revoked_at', null)
    .lte('expires_at', now)
}
