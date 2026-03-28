import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Whether the study can be marked completed: at least one record, and every
 * record’s latest version must be approved.
 */
export async function getStudyCompletionEligibility(
  supabase: SupabaseClient,
  studyId: string
): Promise<{ canComplete: boolean; reason: string | null }> {
  const { data: records, error } = await supabase
    .from('records')
    .select('record_number, version, status')
    .eq('study_id', studyId)

  if (error) {
    return {
      canComplete: false,
      reason: error.message,
    }
  }

  if (!records?.length) {
    return {
      canComplete: false,
      reason:
        'Add at least one record before marking the study as completed.',
    }
  }

  const latestByRecord = new Map<
    string,
    { version: number; status: string }
  >()
  for (const r of records) {
    const key = String(r.record_number)
    const prev = latestByRecord.get(key)
    if (!prev || r.version > prev.version) {
      latestByRecord.set(key, { version: r.version, status: r.status })
    }
  }

  for (const row of latestByRecord.values()) {
    if (row.status !== 'approved') {
      return {
        canComplete: false,
        reason:
          'All records must have their latest version approved before the study can be completed.',
      }
    }
  }

  return { canComplete: true, reason: null }
}
