'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAuditEvent } from '@/lib/supabase/audit'
import { generateHash } from '@/lib/crypto'
import { canManageStudyMembers } from '@/lib/supabase/permissions'
import type { RecordTemplate } from '@/lib/types'

export async function updateRecordTemplates(
  studyId: string,
  templates: RecordTemplate[]
) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/auth/signin')
  }

  const allowed = await canManageStudyMembers(user.id, studyId)
  if (!allowed) {
    return { error: 'You do not have permission to update study settings' }
  }

  const { data: existing } = await supabase
    .from('studies')
    .select('metadata')
    .eq('id', studyId)
    .single()

  const existingMetadata = (existing?.metadata ?? {}) as Record<string, unknown>
  const previousHash = existingMetadata.record_templates
    ? await generateHash({ record_templates: existingMetadata.record_templates })
    : null
  const newHash = await generateHash({ record_templates: templates })

  const metadata = { ...existingMetadata, record_templates: templates }

  const { error } = await supabase
    .from('studies')
    .update({ metadata })
    .eq('id', studyId)

  if (error) {
    return { error: error.message }
  }

  await createAuditEvent(
    studyId,
    user.id,
    'study_updated',
    'study',
    studyId,
    previousHash,
    newHash,
    { field: 'record_templates' }
  )

  revalidatePath(`/studies/${studyId}`)
  revalidatePath(`/studies/${studyId}/settings`)
  revalidatePath(`/studies/${studyId}/records/new`)
  return {}
}
