'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAuditEvent } from '@/lib/supabase/audit'
import { generateHash } from '@/lib/crypto'
import { canCreateRecord } from '@/lib/supabase/permissions'
import { assertStudyIsActive } from '@/lib/supabase/study-status'

export async function updateStudyDocumentation(studyId: string, documentation: string) {
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
    return { error: 'You do not have permission to edit study documentation' }
  }

  const activeCheck = await assertStudyIsActive(supabase, studyId)
  if (!activeCheck.ok) {
    return { error: activeCheck.error }
  }

  const { data: study, error: fetchError } = await supabase
    .from('studies')
    .select('id, documentation')
    .eq('id', studyId)
    .single()

  if (fetchError || !study) {
    return { error: 'Study not found' }
  }

  const previousHash = study.documentation
    ? await generateHash({ documentation: study.documentation })
    : null
  const newHash = await generateHash({ documentation: documentation ?? '' })

  const { error: updateError } = await supabase
    .from('studies')
    .update({ documentation: documentation?.trim() || null })
    .eq('id', studyId)

  if (updateError) {
    return { error: updateError.message }
  }

  await createAuditEvent(
    studyId,
    userId,
    'study_updated',
    'study',
    studyId,
    previousHash,
    newHash,
    { field: 'documentation' }
  )

  revalidatePath(`/studies/${studyId}`)
  return { success: true }
}
