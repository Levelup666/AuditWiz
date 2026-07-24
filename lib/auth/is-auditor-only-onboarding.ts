import type { SupabaseClient } from '@supabase/supabase-js'

/** True when user has no study/institution membership but has a pending audit engagement invite. */
export async function userIsAuditorOnlyOnboarding(
  supabase: SupabaseClient,
  userId: string,
  userEmail: string | undefined
): Promise<boolean> {
  const emailNorm = userEmail?.trim().toLowerCase() ?? ''
  if (!emailNorm) return false

  const { count: instCount } = await supabase
    .from('institution_members')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .is('revoked_at', null)

  if ((instCount ?? 0) > 0) return false

  const { count: studyCount } = await supabase
    .from('study_members')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .is('revoked_at', null)

  if ((studyCount ?? 0) > 0) return false

  const { count: pendingAudit } = await supabase
    .from('audit_engagements')
    .select('id', { count: 'exact', head: true })
    .is('accepted_at', null)
    .is('revoked_at', null)
    .gt('expires_at', new Date().toISOString())
    .ilike('auditor_email', emailNorm)

  return (pendingAudit ?? 0) > 0
}
