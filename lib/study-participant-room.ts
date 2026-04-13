import type { SupabaseClient } from '@supabase/supabase-js'
import { getEffectiveStudyMemberCap } from '@/lib/study-member-cap'

/**
 * Enforces study member cap on distinct users. If candidateUserId is already on the study, returns ok.
 */
export async function assertRoomForNewStudyParticipant(
  supabase: SupabaseClient,
  studyId: string,
  candidateUserId: string | null
): Promise<{ ok: true } | { ok: false; message: string }> {
  const { data: study, error: se } = await supabase
    .from('studies')
    .select('max_members')
    .eq('id', studyId)
    .single()
  if (se || !study) return { ok: false, message: 'Study not found' }
  const cap = getEffectiveStudyMemberCap(study)
  const { data: members } = await supabase
    .from('study_members')
    .select('user_id')
    .eq('study_id', studyId)
    .is('revoked_at', null)
  const users = new Set((members ?? []).map((m) => m.user_id))
  const n = users.size
  if (candidateUserId && users.has(candidateUserId)) {
    return { ok: true }
  }
  if (n >= cap) {
    return {
      ok: false,
      message: `This study has reached its member limit (${cap}).`,
    }
  }
  return { ok: true }
}

export async function activeStudyAssignmentCount(
  supabase: SupabaseClient,
  studyId: string,
  userId: string
): Promise<number> {
  const { count, error } = await supabase
    .from('study_member_role_assignments')
    .select('*', { count: 'exact', head: true })
    .eq('study_id', studyId)
    .eq('user_id', userId)
    .is('revoked_at', null)
  if (error) {
    throw new Error(error.message)
  }
  return count ?? 0
}
