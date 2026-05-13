'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { generateHash } from '@/lib/crypto'
import { canCreateRecord } from '@/lib/supabase/permissions'
import { assertStudyIsActive } from '@/lib/supabase/study-status'
import { createAuditEvent } from '@/lib/supabase/audit'

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export async function createRecord(
  studyId: string,
  formData: FormData
): Promise<void | { error: string; recordId?: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/auth/signin')
  }
  const userId = user!.id

  const allowed = await canCreateRecord(userId, studyId)
  if (!allowed) {
    return { error: 'You do not have permission to create records in this study' }
  }

  const activeCheck = await assertStudyIsActive(supabase, studyId)
  if (!activeCheck.ok) {
    return { error: activeCheck.error }
  }

  const recordNumber = formData.get('record_number') as string
  const contentRaw = formData.get('content') as string
  const taskIdRaw = (formData.get('task_id') as string | null)?.trim() ?? ''
  const taskId = taskIdRaw && UUID_RE.test(taskIdRaw) ? taskIdRaw : null

  if (taskId) {
    const { data: taskRow, error: taskErr } = await supabase
      .from('study_tasks')
      .select('id, study_id, status, title')
      .eq('id', taskId)
      .eq('study_id', studyId)
      .maybeSingle()

    if (taskErr || !taskRow || taskRow.status !== 'open') {
      return { error: 'This task is not available to fulfill with a new record.' }
    }
    const { data: assignee } = await supabase
      .from('study_task_assignees')
      .select('user_id')
      .eq('task_id', taskId)
      .eq('user_id', userId)
      .maybeSingle()
    if (!assignee) {
      return { error: 'You are not assigned to this task.' }
    }
  }

  if (!recordNumber?.trim()) {
    return { error: 'Record number is required' }
  }

  let content: Record<string, unknown> = {}
  if (contentRaw?.trim()) {
    try {
      content = JSON.parse(contentRaw) as Record<string, unknown>
    } catch {
      return { error: 'Content must be valid JSON' }
    }
  }

  const contentHash = await generateHash(content)

  // Check record_number uniqueness per study (avoids cryptic DB error)
  const { data: existing } = await supabase
    .from('records')
    .select('id')
    .eq('study_id', studyId)
    .eq('record_number', recordNumber.trim())
    .limit(1)
    .maybeSingle()

  if (existing) {
    return { error: `Record number "${recordNumber.trim()}" already exists in this study. Use a unique identifier.` }
  }

  const { data: record, error } = await supabase
    .from('records')
    .insert({
      study_id: studyId,
      record_number: recordNumber.trim(),
      version: 1,
      previous_version_id: null,
      status: 'draft',
      created_by: userId,
      content,
      content_hash: contentHash,
      amendment_reason: null,
    })
    .select('id')
    .single()

  if (error) {
    return { error: error.message }
  }

  if (taskId) {
    const { error: rpcError } = await supabase.rpc('complete_study_task_after_record', {
      p_task_id: taskId,
      p_record_id: record.id,
    })
    if (rpcError) {
      revalidatePath(`/studies/${studyId}`)
      revalidatePath('/dashboard')
      return {
        error: `Record was created, but the task could not be marked complete: ${rpcError.message}. You can try again from the study page or contact a study lead.`,
        recordId: record.id,
      }
    }
    const stateHash = await generateHash({
      study_id: studyId,
      task_id: taskId,
      record_id: record.id,
    })
    await createAuditEvent(
      studyId,
      userId,
      'study_task_completed',
      'study_task',
      taskId,
      null,
      stateHash,
      { fulfilled_record_id: record.id }
    )
  }

  revalidatePath(`/studies/${studyId}`)
  revalidatePath('/dashboard')
  redirect(`/studies/${studyId}/records/${record.id}?created=1`)
}

export async function saveDraftRecord(
  studyId: string,
  recordId: string,
  content: Record<string, unknown>
) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'Unauthorized' }
  }

  const allowed = await canCreateRecord(user.id, studyId)
  if (!allowed) {
    return { error: 'You do not have permission to edit records in this study' }
  }

  const activeCheck = await assertStudyIsActive(supabase, studyId)
  if (!activeCheck.ok) {
    return { error: activeCheck.error }
  }

  const { data: record, error: fetchError } = await supabase
    .from('records')
    .select('id, status, content_hash')
    .eq('id', recordId)
    .eq('study_id', studyId)
    .single()

  if (fetchError || !record) {
    return { error: 'Record not found' }
  }

  if (record.status !== 'draft') {
    return { error: 'Only draft records can be saved. Submit or amend to change non-draft records.' }
  }

  const contentHash = await generateHash(content)

  const { error: updateError } = await supabase
    .from('records')
    .update({
      content,
      content_hash: contentHash,
      last_edited_at: new Date().toISOString(),
      last_edited_by: user.id,
    })
    .eq('id', recordId)
    .eq('status', 'draft')

  if (updateError) {
    return { error: updateError.message }
  }

  revalidatePath(`/studies/${studyId}`)
  revalidatePath(`/studies/${studyId}/records/${recordId}`)
  return { success: true }
}
