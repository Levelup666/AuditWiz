// Study-scoped permission checking utilities
// Enforces role-based access control at the application level
// Respects study_members permission flags (can_view, can_comment, can_review, can_approve, can_share)

import { createClient } from './server';
import { StudyRole } from '@/lib/types';

export interface StudyMemberPermissions {
  role: StudyRole;
  can_view: boolean;
  can_comment: boolean;
  can_review: boolean;
  can_approve: boolean;
  can_share: boolean;
}

/**
 * Get user's role and permission flags in a study
 * Returns null if user is not an active member
 */
export async function getStudyMemberPermissions(
  userId: string,
  studyId: string
): Promise<StudyMemberPermissions | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('study_members')
    .select('role, can_view, can_comment, can_review, can_approve, can_share')
    .eq('study_id', studyId)
    .eq('user_id', userId)
    .is('revoked_at', null)
    .order('granted_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;
  return data as StudyMemberPermissions;
}

/**
 * Get user's role in a study
 * Returns null if user is not a member
 */
export async function getUserStudyRole(
  userId: string,
  studyId: string
): Promise<StudyRole | null> {
  const perms = await getStudyMemberPermissions(userId, studyId);
  return perms?.role ?? null;
}

/**
 * Check if user has any of the specified roles in a study
 */
export async function hasStudyRole(
  userId: string,
  studyId: string,
  requiredRoles: StudyRole[]
): Promise<boolean> {
  const role = await getUserStudyRole(userId, studyId);
  return role !== null && requiredRoles.includes(role);
}

/**
 * Check if user can create records in a study (role-based; creators/admins)
 */
export async function canCreateRecord(
  userId: string,
  studyId: string
): Promise<boolean> {
  return hasStudyRole(userId, studyId, ['creator', 'admin']);
}

/**
 * Check if user can review records in a study (role + can_review flag)
 */
export async function canReviewRecord(
  userId: string,
  studyId: string
): Promise<boolean> {
  const perms = await getStudyMemberPermissions(userId, studyId);
  if (!perms?.can_view) return false;
  return (
    ['reviewer', 'approver', 'auditor', 'admin'].includes(perms.role) &&
    perms.can_review
  );
}

/**
 * Check if user can approve records in a study (role + can_approve flag)
 */
export async function canApproveRecord(
  userId: string,
  studyId: string
): Promise<boolean> {
  const perms = await getStudyMemberPermissions(userId, studyId);
  if (!perms?.can_view) return false;
  return (
    ['approver', 'admin'].includes(perms.role) && perms.can_approve
  );
}

/**
 * Check if user can create read-only share links in a study (can_share flag)
 */
export async function canShareRecord(
  userId: string,
  studyId: string
): Promise<boolean> {
  const perms = await getStudyMemberPermissions(userId, studyId);
  return Boolean(perms?.can_share);
}

/**
 * Check if user can audit records in a study
 */
export async function canAuditRecord(
  userId: string,
  studyId: string
): Promise<boolean> {
  return hasStudyRole(userId, studyId, ['auditor', 'admin']);
}

/**
 * Check if user can manage study members (admin only)
 */
export async function canManageStudyMembers(
  userId: string,
  studyId: string
): Promise<boolean> {
  return hasStudyRole(userId, studyId, ['admin']);
}

/**
 * Check if user can comment in a study (can_comment flag)
 */
export async function canCommentInStudy(
  userId: string,
  studyId: string
): Promise<boolean> {
  const perms = await getStudyMemberPermissions(userId, studyId);
  return Boolean(perms?.can_view && perms.can_comment);
}
