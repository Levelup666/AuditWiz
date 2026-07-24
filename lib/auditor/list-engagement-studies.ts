import type { SupabaseClient } from '@supabase/supabase-js'
import { getEngagementStudyIdsForUser } from '@/lib/auditor/engagements'

export type EngagementStudyRow = {
  id: string
  title: string
  status: string
  institution_id: string | null
  updated_at: string
}

/** Studies covered by the user's active audit engagements (not study_members). */
export async function listEngagementScopedStudiesForUser(
  _supabase: SupabaseClient,
  userId: string
): Promise<EngagementStudyRow[]> {
  const studyIds = await getEngagementStudyIdsForUser(userId)
  if (studyIds.length === 0) return []

  const supabase = _supabase
  const { data, error } = await supabase
    .from('studies')
    .select('id, title, status, institution_id, updated_at')
    .in('id', studyIds)
    .order('title', { ascending: true })

  if (error || !data) return []
  return data as EngagementStudyRow[]
}
