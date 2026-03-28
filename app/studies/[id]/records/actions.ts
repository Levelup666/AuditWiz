'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { generateHash } from '@/lib/crypto'
import { canCreateRecord } from '@/lib/supabase/permissions'
import { assertStudyIsActive } from '@/lib/supabase/study-status'

export async function createRecord(studyId: string, formData: FormData) {
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

  revalidatePath(`/studies/${studyId}`)
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
