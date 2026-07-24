import type { SupabaseClient } from '@supabase/supabase-js'

export type ActiveStudyEngagementContext = {
  engagementId: string
  institutionName: string | null
  scope: 'institution_wide' | 'specific_studies'
  purpose: string | null
  startsAt: string
  expiresAt: string
  organizationName: string | null
  auditorTitle: string | null
  referenceId: string | null
}

/** Active audit engagement covering this study for the current user (read-only viewer). */
export async function getActiveEngagementForStudy(
  supabase: SupabaseClient,
  userId: string,
  studyId: string
): Promise<ActiveStudyEngagementContext | null> {
  // Hardened RPC binds to auth.uid(); only p_study_id is accepted.
  const { data: isViewer, error: viewerErr } = await supabase.rpc(
    'is_audit_engagement_viewer_of_study',
    { p_study_id: studyId }
  )
  if (viewerErr || !isViewer) return null

  const { data: study } = await supabase
    .from('studies')
    .select('institution_id')
    .eq('id', studyId)
    .maybeSingle()

  const now = new Date().toISOString()
  const { data: rows } = await supabase
    .from('audit_engagements')
    .select(
      `id, scope, purpose, starts_at, expires_at, institution_id,
       auditor_organization_name, auditor_title, auditor_reference_id,
       institution:institutions(name),
       audit_engagement_studies(study_id)`
    )
    .eq('auditor_user_id', userId)
    .not('accepted_at', 'is', null)
    .is('revoked_at', null)
    .lte('starts_at', now)
    .gt('expires_at', now)

  for (const row of rows ?? []) {
    const inst = row.institution as { name: string } | { name: string }[] | null
    const institutionName = Array.isArray(inst) ? inst[0]?.name ?? null : inst?.name ?? null

    if (row.scope === 'institution_wide') {
      if (study?.institution_id !== row.institution_id) continue
      return {
        engagementId: row.id,
        institutionName,
        scope: row.scope,
        purpose: row.purpose,
        startsAt: row.starts_at,
        expiresAt: row.expires_at,
        organizationName: row.auditor_organization_name ?? null,
        auditorTitle: row.auditor_title ?? null,
        referenceId: row.auditor_reference_id ?? null,
      }
    }

    const linked = (row.audit_engagement_studies ?? []) as { study_id: string }[]
    if (linked.some((s) => s.study_id === studyId)) {
      return {
        engagementId: row.id,
        institutionName,
        scope: row.scope,
        purpose: row.purpose,
        startsAt: row.starts_at,
        expiresAt: row.expires_at,
        organizationName: row.auditor_organization_name ?? null,
        auditorTitle: row.auditor_title ?? null,
        referenceId: row.auditor_reference_id ?? null,
      }
    }
  }

  return null
}
