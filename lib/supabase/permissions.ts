// Study-scoped permission checking utilities
// Enforces role-based access control at the application level

import { createClient } from './server';
import { StudyRole } from '@/lib/types';

/**
 * Get user's role in a study
 * Returns null if user is not a member
 */
export async function getUserStudyRole(
  userId: string,
  studyId: string
): Promise<StudyRole | null> {
  const supabase = await createClient();
  
  const { data, error } = await supabase.rpc('get_user_study_role', {
    p_user_id: userId,
    p_study_id: studyId,
  });

  if (error || !data) {
    return null;
  }

  return data as StudyRole;
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
 * Check if user can create records in a study
 */
export async function canCreateRecord(
  userId: string,
  studyId: string
): Promise<boolean> {
  return hasStudyRole(userId, studyId, ['creator', 'admin']);
}

/**
 * Check if user can review records in a study
 */
export async function canReviewRecord(
  userId: string,
  studyId: string
): Promise<boolean> {
  return hasStudyRole(userId, studyId, ['reviewer', 'approver', 'auditor', 'admin']);
}

/**
 * Check if user can approve records in a study
 */
export async function canApproveRecord(
  userId: string,
  studyId: string
): Promise<boolean> {
  return hasStudyRole(userId, studyId, ['approver', 'admin']);
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
 * Check if user can manage study members
 */
export async function canManageStudyMembers(
  userId: string,
  studyId: string
): Promise<boolean> {
  return hasStudyRole(userId, studyId, ['admin']);
}
