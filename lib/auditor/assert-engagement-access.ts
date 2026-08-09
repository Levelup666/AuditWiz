import type { SupabaseClient } from '@supabase/supabase-js'

export type EngagementAccessRow = {
  id: string
  institution_id: string
  auditor_user_id: string | null
  scope: 'institution_wide' | 'specific_studies'
  purpose: string | null
  starts_at: string
  expires_at: string
  accepted_at: string | null
  revoked_at: string | null
  auditor_organization_name: string | null
  auditor_title: string | null
  auditor_reference_id: string | null
  attested_at: string | null
  attestation_text_hash: string | null
  engagement_letter_file_name: string | null
  engagement_letter_file_path: string | null
  engagement_letter_file_hash: string | null
  engagement_letter_file_size: number | null
  engagement_letter_mime_type: string | null
  engagement_letter_uploaded_at: string | null
  coi_declared_at: string | null
  coi_statement_hash: string | null
  coi_has_conflict: boolean | null
  coi_disclosure: string | null
}

/**
 * Load an accepted, non-revoked, in-window engagement owned by the caller.
 * Used by the read-only auditor API surface.
 */
export async function getOwnedActiveEngagement(
  supabase: SupabaseClient,
  userId: string,
  engagementId: string
): Promise<EngagementAccessRow | null> {
  const nowIso = new Date().toISOString()
  const { data, error } = await supabase
    .from('audit_engagements')
    .select(
      `
      id, institution_id, auditor_user_id, scope, purpose,
      starts_at, expires_at, accepted_at, revoked_at,
      auditor_organization_name, auditor_title, auditor_reference_id,
      attested_at, attestation_text_hash,
      engagement_letter_file_name, engagement_letter_file_path,
      engagement_letter_file_hash, engagement_letter_file_size,
      engagement_letter_mime_type, engagement_letter_uploaded_at,
      coi_declared_at, coi_statement_hash, coi_has_conflict, coi_disclosure
    `
    )
    .eq('id', engagementId)
    .eq('auditor_user_id', userId)
    .not('accepted_at', 'is', null)
    .is('revoked_at', null)
    .lte('starts_at', nowIso)
    .gt('expires_at', nowIso)
    .maybeSingle()

  if (error || !data) return null
  return data as EngagementAccessRow
}
