// Helpers for `audit_engagements` (external/internal auditor grants).
// All checks run server-side; do not rely on client validation.

import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import type { AuditEngagement, AuditEngagementScope } from '@/lib/types'

export type EngagementStatus =
  | 'pending'
  | 'active'
  | 'expired'
  | 'revoked'

export function getEngagementStatus(
  e: Pick<AuditEngagement, 'accepted_at' | 'revoked_at' | 'starts_at' | 'expires_at'>,
  now: Date = new Date()
): EngagementStatus {
  if (e.revoked_at) return 'revoked'
  if (new Date(e.expires_at) <= now) return 'expired'
  if (!e.accepted_at) return 'pending'
  if (new Date(e.starts_at) > now) return 'pending'
  return 'active'
}

export function isEngagementUsable(
  e: Pick<AuditEngagement, 'accepted_at' | 'revoked_at' | 'starts_at' | 'expires_at'>,
  now: Date = new Date()
): boolean {
  return getEngagementStatus(e, now) === 'active'
}

/**
 * Active, accepted engagements for this user (institution + specific studies, deduped).
 * Uses the calling user's session client; relies on the "Auditor can view own engagement"
 * RLS policy.
 */
export async function listActiveEngagementsForUser(
  supabase: SupabaseClient,
  userId: string
): Promise<Array<AuditEngagement & { institution_name: string | null; studies: { study_id: string; study_title: string | null }[] }>> {
  const nowIso = new Date().toISOString()
  const { data: rows, error } = await supabase
    .from('audit_engagements')
    .select(
      `
      id, institution_id, auditor_email, auditor_user_id, scope, purpose,
      starts_at, expires_at, accepted_at, revoked_at, revocation_reason,
      granted_by, last_sent_at, resend_count,
      invite_first_opened_at, expiry_audit_logged_at, created_at,
      institution:institutions(id, name)
    `
    )
    .eq('auditor_user_id', userId)
    .not('accepted_at', 'is', null)
    .is('revoked_at', null)
    .lte('starts_at', nowIso)
    .gt('expires_at', nowIso)

  if (error || !rows) return []

  const engagementIds = rows.map((r) => r.id)
  const { data: studyRows } = engagementIds.length
    ? await supabase
        .from('audit_engagement_studies')
        .select(
          `engagement_id, study_id, added_at, study:studies(id, title)`
        )
        .in('engagement_id', engagementIds)
    : { data: [] as Array<{
        engagement_id: string
        study_id: string
        study: { id: string; title: string } | { id: string; title: string }[] | null
      }> }

  const studiesByEngagement = new Map<string, { study_id: string; study_title: string | null }[]>()
  for (const row of studyRows ?? []) {
    const raw = row.study as { id: string; title: string } | { id: string; title: string }[] | null
    const study = Array.isArray(raw) ? raw[0] ?? null : raw
    const list = studiesByEngagement.get(row.engagement_id) ?? []
    list.push({ study_id: row.study_id, study_title: study?.title ?? null })
    studiesByEngagement.set(row.engagement_id, list)
  }

  return rows.map((r) => {
    const inst = r.institution as { id: string; name: string } | { id: string; name: string }[] | null
    const institution = Array.isArray(inst) ? inst[0] ?? null : inst
    return {
      id: r.id,
      institution_id: r.institution_id,
      auditor_email: r.auditor_email,
      auditor_user_id: r.auditor_user_id,
      scope: r.scope as AuditEngagementScope,
      purpose: r.purpose,
      starts_at: r.starts_at,
      expires_at: r.expires_at,
      accepted_at: r.accepted_at,
      revoked_at: r.revoked_at,
      revocation_reason: r.revocation_reason,
      granted_by: r.granted_by,
      last_sent_at: r.last_sent_at,
      resend_count: r.resend_count ?? 0,
      invite_first_opened_at: r.invite_first_opened_at,
      expiry_audit_logged_at: r.expiry_audit_logged_at,
      created_at: r.created_at,
      institution_name: institution?.name ?? null,
      studies: studiesByEngagement.get(r.id) ?? [],
    }
  })
}

/** Returns the union of study ids covered by ANY active engagement for the user. */
export async function getEngagementStudyIdsForUser(userId: string): Promise<string[]> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('audit_engagement_study_ids_for_user', {
    p_user_id: userId,
  })
  if (error || !data) return []
  return [...new Set((data as Array<{ audit_engagement_study_ids_for_user: string } | string>).map((row) =>
    typeof row === 'string' ? row : row.audit_engagement_study_ids_for_user
  ))]
}

/** True if user has any usable engagement (drives nav surface). */
export async function userHasActiveEngagement(userId: string): Promise<boolean> {
  const supabase = await createClient()
  const ids = await getEngagementStudyIdsForUser(userId)
  if (ids.length > 0) return true
  // institution_wide engagements with no studies in the institution still count as "active";
  // double-check by fetching one row.
  const nowIso = new Date().toISOString()
  const { data } = await supabase
    .from('audit_engagements')
    .select('id', { head: false })
    .eq('auditor_user_id', userId)
    .not('accepted_at', 'is', null)
    .is('revoked_at', null)
    .lte('starts_at', nowIso)
    .gt('expires_at', nowIso)
    .limit(1)
  return Boolean(data && data.length > 0)
}

/** Server-side scope check for a single engagement and study. Use in API guards. */
export async function isAuditorScopedToStudy(
  userId: string,
  studyId: string
): Promise<boolean> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('is_audit_engagement_viewer_of_study', {
    p_study_id: studyId,
    p_user_id: userId,
  })
  if (error) return false
  return Boolean(data)
}
