export type StudyTaskStatus = 'open' | 'completed' | 'cancelled'

export type StudyTaskListItem = {
  id: string
  study_id: string
  title: string
  description: string | null
  due_at: string | null
  status: StudyTaskStatus
  created_at: string
  fulfilled_record_id: string | null
  completed_at: string | null
  assignees: { user_id: string; label: string }[]
}
