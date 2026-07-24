import type { SupabaseClient } from '@supabase/supabase-js'
import { userHasActiveEngagement } from '@/lib/auditor/engagements'

async function userHasActiveMembership(
  supabase: SupabaseClient,
  userId: string
): Promise<boolean> {
  const { count: instCount } = await supabase
    .from('institution_members')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .is('revoked_at', null)

  if ((instCount ?? 0) > 0) return true

  const { count: studyCount } = await supabase
    .from('study_members')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .is('revoked_at', null)

  return (studyCount ?? 0) > 0
}

/**
 * True when the user has an active audit engagement and no study/institution membership.
 * Used to present the auditor-primary workspace (minimal nav, engagement study browser).
 */
export async function userIsAuditorPrimary(
  supabase: SupabaseClient,
  userId: string
): Promise<boolean> {
  if (await userHasActiveMembership(supabase, userId)) return false
  return userHasActiveEngagement(userId)
}
