import { createClient } from '@/lib/supabase/server'
import { institutionAllowsExternalCollaborators } from '@/lib/institution-collaboration'

export type StudyCollaborationPolicy = {
  institutionId: string | null
  allowExternalCollaborators: boolean
  studyTitle: string
}

/**
 * Loads study title, institution, and whether external study collaborators are allowed (defaults true if unknown).
 */
export async function getStudyCollaborationPolicy(
  studyId: string
): Promise<StudyCollaborationPolicy> {
  const supabase = await createClient()
  const { data: study } = await supabase
    .from('studies')
    .select('title, institution_id, institution:institutions(metadata)')
    .eq('id', studyId)
    .maybeSingle()

  const institutionId = study?.institution_id ?? null
  const inst = study?.institution as { metadata?: unknown } | null | undefined
  const allowExternalCollaborators = institutionAllowsExternalCollaborators(inst?.metadata ?? null)

  return {
    institutionId,
    allowExternalCollaborators,
    studyTitle: (study as { title?: string })?.title ?? 'Study',
  }
}
