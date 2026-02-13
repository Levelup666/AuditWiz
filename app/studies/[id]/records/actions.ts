'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { generateHash } from '@/lib/crypto'
import { canCreateRecord } from '@/lib/supabase/permissions'

export async function createRecord(studyId: string, formData: FormData) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/auth/signin')
  }

  const allowed = await canCreateRecord(user.id, studyId)
  if (!allowed) {
    return { error: 'You do not have permission to create records in this study' }
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

  const { data: record, error } = await supabase
    .from('records')
    .insert({
      study_id: studyId,
      record_number: recordNumber.trim(),
      version: 1,
      previous_version_id: null,
      status: 'draft',
      created_by: user.id,
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
  redirect(`/studies/${studyId}/records/${record.id}`)
}
