import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import StudyTasksPanel from '@/components/studies/study-tasks-panel'
import type { StudyTaskListItem } from '@/lib/study-tasks'
import { formatMemberListName } from '@/lib/profile/member-display-name'

type TaskAssigneeRow = { user_id: string }

type TaskRow = {
  id: string
  study_id: string
  title: string
  description: string | null
  due_at: string | null
  status: string
  created_at: string
  fulfilled_record_id: string | null
  completed_at: string | null
  study_task_assignees: TaskAssigneeRow[] | null
}

export default async function StudyTasksSection(props: {
  studyId: string
  userId: string
  canManageMembers: boolean
  canCreateRecords: boolean
  studyIsActive: boolean
}) {
  const supabase = await createClient()
  const { data: tasks, error } = await supabase
    .from('study_tasks')
    .select(
      'id, study_id, title, description, due_at, status, created_at, fulfilled_record_id, completed_at, study_task_assignees(user_id)'
    )
    .eq('study_id', props.studyId)
    .order('created_at', { ascending: false })

  if (error) {
    return (
      <p className="text-sm text-destructive">
        Tasks could not be loaded. If you just migrated, apply the latest database migration.
      </p>
    )
  }

  const rows = (tasks ?? []) as TaskRow[]
  const allUserIds = [
    ...new Set(
      rows.flatMap((t) => (t.study_task_assignees ?? []).map((a) => a.user_id))
    ),
  ]

  const { data: profiles } =
    allUserIds.length > 0
      ? await supabase
          .from('profiles')
          .select('id, nickname, first_name, last_name, display_name')
          .in('id', allUserIds)
      : { data: [] as const }

  const profileMap = new Map((profiles ?? []).map((p) => [p.id, p]))
  const emailMap = new Map<string, string>()
  if (allUserIds.length > 0) {
    try {
      const admin = createAdminClient()
      await Promise.all(
        allUserIds.map(async (userId) => {
          try {
            const { data } = await admin.auth.admin.getUserById(userId)
            const email = data.user?.email?.trim()
            if (email) emailMap.set(userId, email)
          } catch {
            // A missing admin email should not leak the raw UUID into user-facing task labels.
          }
        })
      )
    } catch {
      // Keep task rendering available even if the service role is unavailable locally.
    }
  }

  const items: StudyTaskListItem[] = rows.map((t) => ({
    id: t.id,
    study_id: t.study_id,
    title: t.title,
    description: t.description,
    due_at: t.due_at,
    status: t.status as StudyTaskListItem['status'],
    created_at: t.created_at,
    fulfilled_record_id: t.fulfilled_record_id,
    completed_at: t.completed_at,
    assignees: (t.study_task_assignees ?? []).map((a) => {
      const p = profileMap.get(a.user_id)
      return {
        user_id: a.user_id,
        label: formatMemberListName(
          {
            nickname: p?.nickname,
            first_name: p?.first_name,
            last_name: p?.last_name,
            display_name: p?.display_name,
          },
          { email: emailMap.get(a.user_id) }
        ),
      }
    }),
  }))

  return (
    <StudyTasksPanel
      studyId={props.studyId}
      userId={props.userId}
      canManageMembers={props.canManageMembers}
      canCreateRecords={props.canCreateRecords}
      studyIsActive={props.studyIsActive}
      initialTasks={items}
    />
  )
}
