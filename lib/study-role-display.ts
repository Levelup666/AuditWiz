/** Human-readable labels for study role slugs in UI (invites, lists). */
const STUDY_ROLE_LABELS: Record<string, string> = {
  member: 'Member',
  reviewer: 'Reviewer',
  approver: 'Approver',
  auditor: 'Auditor',
  admin: 'Admin',
  creator: 'Admin', // legacy invites / rows migrated to admin
}

export function formatStudyRoleLabel(slug: string | null | undefined): string {
  if (!slug?.trim()) return 'Member'
  const key = slug.trim().toLowerCase()
  return STUDY_ROLE_LABELS[key] ?? slug.trim()
}
