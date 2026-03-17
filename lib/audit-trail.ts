/**
 * Shared audit trail utilities: badge styles and human-readable action labels.
 */

export const ACTION_BADGE_STYLES: Record<string, string> = {
  study_created: 'bg-blue-100 text-blue-800',
  study_updated: 'bg-blue-100 text-blue-800',
  study_deleted: 'bg-red-100 text-red-800',
  member_added: 'bg-green-100 text-green-800',
  member_removed: 'bg-red-100 text-red-800',
  member_role_changed: 'bg-yellow-100 text-yellow-800',
  study_member_invited: 'bg-amber-100 text-amber-800',
  study_member_joined: 'bg-green-100 text-green-800',
  institution_created: 'bg-blue-100 text-blue-800',
  institution_updated: 'bg-blue-100 text-blue-800',
  institution_deleted: 'bg-red-100 text-red-800',
  institution_member_added: 'bg-green-100 text-green-800',
  institution_member_removed: 'bg-red-100 text-red-800',
  institution_member_role_changed: 'bg-yellow-100 text-yellow-800',
  institution_member_invited: 'bg-amber-100 text-amber-800',
  institution_member_joined: 'bg-green-100 text-green-800',
  record_created: 'bg-blue-100 text-blue-800',
  record_draft_updated: 'bg-slate-100 text-slate-800',
  record_amended: 'bg-purple-100 text-purple-800',
  record_submitted: 'bg-yellow-100 text-yellow-800',
  record_rejected: 'bg-red-100 text-red-800',
  record_approved: 'bg-green-100 text-green-800',
  record_deleted: 'bg-red-100 text-red-800',
  document_uploaded: 'bg-cyan-100 text-cyan-800',
  document_deleted: 'bg-red-100 text-red-800',
  signature_added: 'bg-green-100 text-green-800',
  signature_revoked: 'bg-red-100 text-red-800',
  identity_linked: 'bg-teal-100 text-teal-800',
  share_created: 'bg-sky-100 text-sky-800',
  share_accessed: 'bg-sky-100 text-sky-800',
  ai_action: 'bg-orange-100 text-orange-800',
  system_action: 'bg-gray-100 text-gray-800',
  blockchain_anchored: 'bg-indigo-100 text-indigo-800',
}

export function formatActionType(actionType: string): string {
  return actionType.replace(/_/g, ' ')
}
