'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { canManageStudyMembers } from '@/lib/supabase/permissions'

export interface StudySettingsInput {
  required_approval_count: number
  require_review_before_approval: boolean
  allow_creator_approval: boolean
  ai_enabled?: boolean
}

export async function updateStudySettings(
  studyId: string,
  settings: StudySettingsInput
) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/auth/signin')
  }
  const allowed = await canManageStudyMembers(user!.id, studyId)
  if (!allowed) {
    return { error: 'You do not have permission to update study settings' }
  }

  const count = Math.max(1, Math.floor(settings.required_approval_count))
  if (Number.isNaN(count) || count < 1) {
    return { error: 'Required approval count must be at least 1' }
  }

  const { data: existing } = await supabase
    .from('studies')
    .select('metadata')
    .eq('id', studyId)
    .single()

  const existingMetadata = (existing?.metadata ?? {}) as Record<string, unknown>
  const metadata =
    settings.ai_enabled !== undefined
      ? { ...existingMetadata, ai_enabled: settings.ai_enabled }
      : existingMetadata

  const { error } = await supabase
    .from('studies')
    .update({
      required_approval_count: count,
      require_review_before_approval: Boolean(settings.require_review_before_approval),
      allow_creator_approval: Boolean(settings.allow_creator_approval),
      metadata,
    })
    .eq('id', studyId)

  if (error) {
    return { error: error.message }
  }

  revalidatePath(`/studies/${studyId}`)
  revalidatePath(`/studies/${studyId}/settings`)
  return {}
}
