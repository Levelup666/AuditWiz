/**
 * Auditable corpus for audit engagements (SELECT via RLS).
 *
 * Engagement auditors are NOT study_members / institution_members. Access is granted only
 * through is_audit_engagement_viewer_of_study / institution helpers.
 *
 * IN CORPUS (read):
 * - studies (scoped)
 * - records, documents (metadata + download when row visible), signatures, blockchain_anchors
 * - audit_events (study-scoped)
 * - institutions (hosting engagement)
 * - audit_engagements / audit_engagement_studies (own rows)
 *
 * OUT OF CORPUS today (gaps — intentional until product expands):
 * - study_tasks / assignees
 * - institution_members roster
 * - other users' profiles (attribution may show "Unknown")
 * - share links / share_access_events
 * - write paths (create/amend/sign/approve/anchor/member manage)
 *
 * Access must emit audit_engagement_accessed (hub/study/record) and audit_engagement_export
 * (evidence pack). Do not add auditors to study_members to "fill gaps."
 */

export const AUDIT_ENGAGEMENT_CORPUS_TABLES = [
  'studies',
  'records',
  'documents',
  'signatures',
  'blockchain_anchors',
  'audit_events',
  'institutions',
  'audit_engagements',
  'audit_engagement_studies',
] as const

export const AUDIT_ENGAGEMENT_CORPUS_GAPS = [
  'study_tasks',
  'institution_members',
  'profiles_of_others',
  'share_access_events',
] as const
