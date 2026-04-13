import type { SupabaseClient } from '@supabase/supabase-js'

export type StudyRoleDefinitionRow = {
  id: string
  study_id: string
  slug: string
  display_name: string
  is_system: boolean
  sort_order: number
  can_view: boolean
  can_comment: boolean
  can_review: boolean
  can_approve: boolean
  can_share: boolean
  can_manage_members: boolean
  can_edit_study_settings: boolean
  can_create_records: boolean
  can_moderate_record_status: boolean
  can_anchor_records: boolean
  can_access_audit_hub: boolean
}

/** Built-in slugs seeded for every study. */
export const SYSTEM_ROLE_SLUGS = [
  'creator',
  'reviewer',
  'approver',
  'auditor',
  'admin',
] as const

export type SystemRoleSlug = (typeof SYSTEM_ROLE_SLUGS)[number]

export async function getStudyRoleDefinitionIdBySlug(
  supabase: SupabaseClient,
  studyId: string,
  slug: string
): Promise<string | null> {
  const { data, error } = await supabase
    .from('study_role_definitions')
    .select('id')
    .eq('study_id', studyId)
    .eq('slug', slug)
    .maybeSingle()

  if (error || !data) return null
  return data.id
}

export async function listStudyRoleDefinitions(
  supabase: SupabaseClient,
  studyId: string
): Promise<StudyRoleDefinitionRow[]> {
  const { data, error } = await supabase
    .from('study_role_definitions')
    .select('*')
    .eq('study_id', studyId)
    .order('sort_order', { ascending: true })
    .order('display_name', { ascending: true })

  if (error) throw new Error(error.message)
  return (data ?? []) as StudyRoleDefinitionRow[]
}
