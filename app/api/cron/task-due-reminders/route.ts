import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { notifyTaskDueSoon } from '@/lib/notifications/study-events'

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  const authHeader = request.headers.get('authorization')

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient()
  const now = new Date()
  const windowEnd = new Date(now.getTime() + 24 * 60 * 60 * 1000)

  const { data: tasks, error } = await admin
    .from('study_tasks')
    .select('id, study_id, title, due_at, studies(title)')
    .eq('status', 'open')
    .not('due_at', 'is', null)
    .gte('due_at', now.toISOString())
    .lte('due_at', windowEnd.toISOString())

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  let notified = 0

  for (const task of tasks ?? []) {
    const studyTitle =
      task.studies && typeof task.studies === 'object' && 'title' in task.studies
        ? ((task.studies as { title?: string }).title ?? 'Study')
        : 'Study'

    const { data: assignees } = await admin
      .from('study_task_assignees')
      .select('user_id')
      .eq('task_id', task.id)

    const assigneeUserIds = (assignees ?? []).map((a) => a.user_id as string)
    if (assigneeUserIds.length === 0 || !task.due_at) continue

    await notifyTaskDueSoon(admin, {
      studyId: task.study_id as string,
      studyTitle,
      taskId: task.id as string,
      taskTitle: (task.title as string) || 'Task',
      dueAt: task.due_at as string,
      assigneeUserIds,
    })
    notified += assigneeUserIds.length
  }

  return NextResponse.json({
    success: true,
    tasks_scanned: (tasks ?? []).length,
    notifications_attempted: notified,
  })
}
