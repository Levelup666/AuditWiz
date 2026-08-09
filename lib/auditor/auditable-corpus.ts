/**
 * Auditable corpus for audit engagements (SELECT via RLS).
 *
 * Engagement auditors are NOT study_members / institution_members. Access is granted only
 * through is_audit_engagement_viewer_of_study / institution helpers.
 *
 * Primary review UX: /auditor/engagements/[id]/studies/.../records/... (read-only routes).
 * Member /studies/... pages redirect engagement-only and dual-role auditor-context users there.
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
 * Access emits audit_engagement_accessed per (engagement, surface, study|record) with session
 * dedupe. Evidence pack export emits audit_engagement_export and includes document hashes.
 * Engagement letter upload emits audit_engagement_letter_uploaded.
 * Dual-role users in auditor context cannot call member write APIs (cookie sandbox).
 * Do not add auditors to study_members to "fill gaps."
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

/** Artifacts attached to the engagement row itself (letter PDF in storage + COI fields). */
export const AUDIT_ENGAGEMENT_TRUST_ARTIFACTS = [
  'engagement_letter_pdf',
  'auditor_credentials_attestation',
  'coi_declaration',
] as const

export const AUDIT_ENGAGEMENT_READ_ONLY_API = [
  'GET /api/auditor/engagements',
  'GET /api/auditor/engagements/[engagementId]',
  'GET /api/auditor/engagements/[engagementId]/studies',
  'GET /api/auditor/engagements/[engagementId]/records',
  'GET /api/auditor/engagements/[engagementId]/letter',
  'GET /api/auditor/engagements/[engagementId]/evidence-pack',
] as const

export const AUDIT_ENGAGEMENT_REVIEW_ROUTES = [
  '/auditor',
  '/auditor/engagements/[engagementId]',
  '/auditor/engagements/[engagementId]/studies/[studyId]',
  '/auditor/engagements/[engagementId]/studies/[studyId]/records/[recordId]',
] as const

export const AUDIT_ENGAGEMENT_CORPUS_GAPS = [
  'study_tasks',
  'institution_members',
  'profiles_of_others',
  'share_access_events',
] as const
