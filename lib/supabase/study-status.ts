import type { SupabaseClient } from '@supabase/supabase-js'

/** User-facing message when mutations require an active study. */
export const STUDY_NOT_ACTIVE_ERROR =
  'This study is not active. Only active studies can be edited.'

export async function getStudyStatus(
  supabase: SupabaseClient,
  studyId: string
): Promise<string | null> {
  const { data } = await supabase
    .from('studies')
    .select('status')
    .eq('id', studyId)
    .maybeSingle()
  return (data?.status as string | undefined) ?? null
}

export async function assertStudyIsActive(
  supabase: SupabaseClient,
  studyId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const status = await getStudyStatus(supabase, studyId)
  if (status !== 'active') {
    return { ok: false, error: STUDY_NOT_ACTIVE_ERROR }
  }
  return { ok: true }
}
