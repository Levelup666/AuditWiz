'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { canManageStudyMembers } from '@/lib/supabase/permissions'
import { assertStudyIsActive } from '@/lib/supabase/study-status'
import { createAuditEvent } from '@/lib/supabase/audit'
import { generateHash } from '@/lib/crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { notifyTaskAssigned } from '@/lib/notifications/study-events'

async function assertAllUsersAreActiveStudyMembers(
  supabase: Awaited<ReturnType<typeof createClient>>,
  studyId: string,
  userIds: string[]
): Promise<{ ok: true } | { ok: false; error: string }> {
  const unique = [...new Set(userIds.filter(Boolean))]
  if (unique.length === 0) {
    return { ok: false, error: 'At least one assignee is required' }
  }
  const { data, error } = await supabase
    .from('study_members')
    .select('user_id')
    .eq('study_id', studyId)
    .is('revoked_at', null)
    .in('user_id', unique)

  if (error) {
    return { ok: false, error: error.message }
  }
  const found = new Set((data ?? []).map((r) => r.user_id))
  for (const id of unique) {
    if (!found.has(id)) {
      return { ok: false, error: 'All assignees must be active study members' }
    }
  }
  return { ok: true }
}

async function loadStudyTitle(
  supabase: Awaited<ReturnType<typeof createClient>>,
  studyId: string
): Promise<string> {
  const { data } = await supabase.from('studies').select('title').eq('id', studyId).single()
  return (data?.title as string) || 'Study'
}

async function sendTaskAssignedNotifications(
  studyId: string,
  studyTitle: string,
  taskId: string,
  taskTitle: string,
  assigneeUserIds: string[],
  dueAt: string | null
): Promise<void> {
  if (assigneeUserIds.length === 0) return
  try {
    const admin = createAdminClient()
    await notifyTaskAssigned(admin, {
      studyId,
      studyTitle,
      taskId,
      taskTitle,
      assigneeUserIds,
      dueAt,
    })
  } catch (e) {
    console.error('Failed to create task assigned notifications', e)
  }
}

export async function createStudyTask(
  studyId: string,
  input: { title: string; description: string | null; dueAt: string | null; assigneeUserIds: string[] }
) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { error: 'Unauthorized' }
  }
  const allowed = await canManageStudyMembers(user.id, studyId)
  if (!allowed) {
    return { error: 'You do not have permission to create tasks in this study' }
  }
  const activeCheck = await assertStudyIsActive(supabase, studyId)
  if (!activeCheck.ok) {
    return { error: activeCheck.error }
  }

  const title = input.title?.trim()
  if (!title) {
    return { error: 'Title is required' }
  }

  const memberCheck = await assertAllUsersAreActiveStudyMembers(supabase, studyId, input.assigneeUserIds)
  if (!memberCheck.ok) {
    return { error: memberCheck.error }
  }

  const { data: task, error: insertErr } = await supabase
    .from('study_tasks')
    .insert({
      study_id: studyId,
      title,
      description: input.description?.trim() || null,
      due_at: input.dueAt?.trim() || null,
      status: 'open',
      created_by: user.id,
    })
    .select('id')
    .single()

  if (insertErr || !task) {
    return { error: insertErr?.message ?? 'Failed to create task' }
  }

  const assignRows = input.assigneeUserIds.map((user_id) => ({ task_id: task.id, user_id }))
  const { error: assignErr } = await supabase.from('study_task_assignees').insert(assignRows)
  if (assignErr) {
    await supabase.from('study_tasks').delete().eq('id', task.id)
    return { error: assignErr.message }
  }

  const stateHash = await generateHash({
    study_id: studyId,
    task_id: task.id,
    title,
    assignees: input.assigneeUserIds,
  })
  await createAuditEvent(
    studyId,
    user.id,
    'study_task_created',
    'study_task',
    task.id,
    null,
    stateHash,
    { title, assignee_user_ids: input.assigneeUserIds }
  )

  const studyTitle = await loadStudyTitle(supabase, studyId)
  await sendTaskAssignedNotifications(
    studyId,
    studyTitle,
    task.id,
    title,
    input.assigneeUserIds,
    input.dueAt?.trim() || null
  )

  revalidatePath(`/studies/${studyId}`)
  revalidatePath('/dashboard')
  return { success: true, taskId: task.id }
}

export async function updateStudyTask(
  studyId: string,
  taskId: string,
  input: { title: string; description: string | null; dueAt: string | null; assigneeUserIds: string[] }
) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { error: 'Unauthorized' }
  }
  const allowed = await canManageStudyMembers(user.id, studyId)
  if (!allowed) {
    return { error: 'You do not have permission to update tasks in this study' }
  }
  const activeCheck = await assertStudyIsActive(supabase, studyId)
  if (!activeCheck.ok) {
    return { error: activeCheck.error }
  }

  const { data: existing, error: fetchErr } = await supabase
    .from('study_tasks')
    .select('id, status, study_id')
    .eq('id', taskId)
    .eq('study_id', studyId)
    .single()

  if (fetchErr || !existing || existing.status !== 'open') {
    return { error: 'Task not found or cannot be edited' }
  }

  const { data: existingAssignees } = await supabase
    .from('study_task_assignees')
    .select('user_id')
    .eq('task_id', taskId)
  const previousAssigneeIds = new Set((existingAssignees ?? []).map((a) => a.user_id as string))

  const title = input.title?.trim()
  if (!title) {
    return { error: 'Title is required' }
  }

  const memberCheck = await assertAllUsersAreActiveStudyMembers(supabase, studyId, input.assigneeUserIds)
  if (!memberCheck.ok) {
    return { error: memberCheck.error }
  }

  const { error: updErr } = await supabase
    .from('study_tasks')
    .update({
      title,
      description: input.description?.trim() || null,
      due_at: input.dueAt?.trim() || null,
    })
    .eq('id', taskId)
    .eq('study_id', studyId)
    .eq('status', 'open')

  if (updErr) {
    return { error: updErr.message }
  }

  await supabase.from('study_task_assignees').delete().eq('task_id', taskId)
  const assignRows = input.assigneeUserIds.map((user_id) => ({ task_id: taskId, user_id }))
  const { error: assignErr } = await supabase.from('study_task_assignees').insert(assignRows)
  if (assignErr) {
    return { error: assignErr.message }
  }

  const stateHash = await generateHash({
    study_id: studyId,
    task_id: taskId,
    title,
    assignees: input.assigneeUserIds,
  })
  await createAuditEvent(
    studyId,
    user.id,
    'study_task_updated',
    'study_task',
    taskId,
    null,
    stateHash,
    { title, assignee_user_ids: input.assigneeUserIds }
  )

  const newlyAssigned = input.assigneeUserIds.filter((id) => !previousAssigneeIds.has(id))
  const studyTitle = await loadStudyTitle(supabase, studyId)
  await sendTaskAssignedNotifications(
    studyId,
    studyTitle,
    taskId,
    title,
    newlyAssigned,
    input.dueAt?.trim() || null
  )

  revalidatePath(`/studies/${studyId}`)
  revalidatePath('/dashboard')
  return { success: true }
}

export async function cancelStudyTask(studyId: string, taskId: string) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { error: 'Unauthorized' }
  }
  const allowed = await canManageStudyMembers(user.id, studyId)
  if (!allowed) {
    return { error: 'You do not have permission to cancel tasks in this study' }
  }

  const { data: existing, error: fetchErr } = await supabase
    .from('study_tasks')
    .select('id, status, title')
    .eq('id', taskId)
    .eq('study_id', studyId)
    .single()

  if (fetchErr || !existing || existing.status !== 'open') {
    return { error: 'Task not found or cannot be cancelled' }
  }

  const { error: updErr } = await supabase
    .from('study_tasks')
    .update({
      status: 'cancelled',
      cancelled_at: new Date().toISOString(),
    })
    .eq('id', taskId)
    .eq('study_id', studyId)
    .eq('status', 'open')

  if (updErr) {
    return { error: updErr.message }
  }

  const stateHash = await generateHash({ study_id: studyId, task_id: taskId, action: 'cancelled' })
  await createAuditEvent(
    studyId,
    user.id,
    'study_task_cancelled',
    'study_task',
    taskId,
    null,
    stateHash,
    { title: existing.title }
  )

  revalidatePath(`/studies/${studyId}`)
  revalidatePath('/dashboard')
  return { success: true }
}
