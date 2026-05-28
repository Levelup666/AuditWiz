import type { SupabaseClient } from '@supabase/supabase-js'

export type DashboardMemberStats = {
  studiesCount: number
  recordsCount: number
  myOpenTasksCount: number
  errors: {
    studies?: string
    records?: string
    openTasks?: string
  }
}

/**
 * Dashboard metrics scoped to studies where the user is an active member
 * (accepted invite / role assignment), matching /studies list visibility.
 */
export async function getDashboardMemberStats(
  supabase: SupabaseClient,
  userId: string
): Promise<DashboardMemberStats> {
  const errors: DashboardMemberStats['errors'] = {}

  const { count: studiesCount, error: studiesError } = await supabase
    .from('studies')
    .select('id, study_members!inner(user_id)', { count: 'exact', head: true })
    .eq('study_members.user_id', userId)
    .is('study_members.revoked_at', null)

  if (studiesError) {
    errors.studies = studiesError.message
  }

  const { count: recordsCount, error: recordsError } = await supabase
    .from('records')
    .select('id, studies!inner(study_members!inner(user_id))', { count: 'exact', head: true })
    .eq('studies.study_members.user_id', userId)
    .is('studies.study_members.revoked_at', null)

  if (recordsError) {
    errors.records = recordsError.message
  }

  const { count: myOpenTasksCount, error: openTasksError } = await supabase
    .from('study_tasks')
    .select('id, study_task_assignees!inner(user_id), studies!inner(study_members!inner(user_id))', {
      count: 'exact',
      head: true,
    })
    .eq('status', 'open')
    .eq('study_task_assignees.user_id', userId)
    .eq('studies.study_members.user_id', userId)
    .is('studies.study_members.revoked_at', null)

  if (openTasksError) {
    errors.openTasks = openTasksError.message
  }

  return {
    studiesCount: studiesCount ?? 0,
    recordsCount: recordsCount ?? 0,
    myOpenTasksCount: myOpenTasksCount ?? 0,
    errors,
  }
}
