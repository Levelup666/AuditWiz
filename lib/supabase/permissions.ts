// Study-scoped permission checking — merges all active role assignments (max 2 per user per study).

import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from './server'
import type { StudyRole } from '@/lib/types'
import type { StudyRoleDefinitionRow } from '@/lib/supabase/study-roles'

/**
 * Load role definitions for a user's active assignments without PostgREST embeds.
 * Nested `study_role_definitions(...)` selects are brittle (null embeds, shape mismatches)
 * and were denying merged permissions even when assignments existed.
 */
async function loadRoleDefinitionsForAssignments(
  supabase: SupabaseClient,
  studyId: string,
  userId: string
): Promise<StudyRoleDefinitionRow[]> {
  const { data: assigns, error: assignErr } = await supabase
    .from('study_member_role_assignments')
    .select('role_definition_id')
    .eq('study_id', studyId)
    .eq('user_id', userId)
    .is('revoked_at', null)

  if (assignErr || !assigns?.length) {
    return []
  }

  const defIds = [
    ...new Set(
      assigns
        .map((a) => a.role_definition_id)
        .filter((id): id is string => typeof id === 'string' && id.length > 0)
    ),
  ]
  if (defIds.length === 0) {
    return []
  }

  const { data: defs, error: defErr } = await supabase
    .from('study_role_definitions')
    .select('*')
    .eq('study_id', studyId)
    .in('id', defIds)

  if (defErr || !defs?.length) {
    return []
  }

  return defs as StudyRoleDefinitionRow[]
}

export interface StudyMemberPermissions {
  /** All active role slugs for this user in the study (e.g. reviewer+auditor). */
  roles: string[]
  /** Primary slug for display / backward compatibility (lowest sort_order). */
  role: StudyRole | string
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

function mergeDefinitions(defs: StudyRoleDefinitionRow[]): Omit<StudyMemberPermissions, 'roles' | 'role'> {
  const z = {
    can_view: false,
    can_comment: false,
    can_review: false,
    can_approve: false,
    can_share: false,
    can_manage_members: false,
    can_edit_study_settings: false,
    can_create_records: false,
    can_moderate_record_status: false,
    can_anchor_records: false,
    can_access_audit_hub: false,
  }
  for (const d of defs) {
    z.can_view ||= d.can_view
    z.can_comment ||= d.can_comment
    z.can_review ||= d.can_review
    z.can_approve ||= d.can_approve
    z.can_share ||= d.can_share
    z.can_manage_members ||= d.can_manage_members
    z.can_edit_study_settings ||= d.can_edit_study_settings
    z.can_create_records ||= d.can_create_records
    z.can_moderate_record_status ||= d.can_moderate_record_status
    z.can_anchor_records ||= d.can_anchor_records
    z.can_access_audit_hub ||= d.can_access_audit_hub
  }
  return z
}

/**
 * Effective permissions = OR of all active role definitions for this user in the study.
 */
export async function getStudyMemberPermissions(
  userId: string,
  studyId: string
): Promise<StudyMemberPermissions | null> {
  const supabase = await createClient()
  const defs = await loadRoleDefinitionsForAssignments(supabase, studyId, userId)
  if (!defs.length) return null

  defs.sort((a, b) => a.sort_order - b.sort_order || a.slug.localeCompare(b.slug))
  const merged = mergeDefinitions(defs)
  const roles = defs.map((d) => d.slug)
  const primary = defs[0]!.slug as StudyRole | string

  return {
    roles,
    role: primary,
    ...merged,
  }
}

export async function getUserStudyRole(
  userId: string,
  studyId: string
): Promise<StudyRole | string | null> {
  const perms = await getStudyMemberPermissions(userId, studyId)
  return perms?.role ?? null
}

export function hasStudyRoleSlug(
  perms: StudyMemberPermissions | null,
  requiredSlugs: string[]
): boolean {
  if (!perms) return false
  return requiredSlugs.some((s) => perms.roles.includes(s))
}

/**
 * True if any merged role slug matches the legacy StudyRole set.
 */
export async function hasStudyRole(
  userId: string,
  studyId: string,
  requiredRoles: StudyRole[]
): Promise<boolean> {
  const perms = await getStudyMemberPermissions(userId, studyId)
  if (!perms) return false
  return requiredRoles.some((r) => perms.roles.includes(r))
}

export async function canCreateRecord(
  userId: string,
  studyId: string
): Promise<boolean> {
  const perms = await getStudyMemberPermissions(userId, studyId)
  return Boolean(perms?.can_create_records)
}

export async function canReviewRecord(
  userId: string,
  studyId: string
): Promise<boolean> {
  const perms = await getStudyMemberPermissions(userId, studyId)
  if (!perms?.can_view) return false
  return Boolean(perms.can_review)
}

export async function canApproveRecord(
  userId: string,
  studyId: string
): Promise<boolean> {
  const perms = await getStudyMemberPermissions(userId, studyId)
  if (!perms?.can_view) return false
  return Boolean(perms.can_approve)
}

export async function canShareRecord(
  userId: string,
  studyId: string
): Promise<boolean> {
  const perms = await getStudyMemberPermissions(userId, studyId)
  return Boolean(perms?.can_share)
}

export async function canAuditRecord(
  userId: string,
  studyId: string
): Promise<boolean> {
  const perms = await getStudyMemberPermissions(userId, studyId)
  return Boolean(perms?.can_access_audit_hub)
}

export async function getStudyIdsWhereUserCanAudit(
  userId: string
): Promise<string[]> {
  const supabase = await createClient()
  const { data: assigns, error: assignErr } = await supabase
    .from('study_member_role_assignments')
    .select('study_id, role_definition_id')
    .eq('user_id', userId)
    .is('revoked_at', null)

  if (assignErr || !assigns?.length) return []

  const defIds = [
    ...new Set(
      assigns
        .map((a) => a.role_definition_id)
        .filter((id): id is string => typeof id === 'string' && id.length > 0)
    ),
  ]
  if (defIds.length === 0) return []

  const { data: defs, error: defErr } = await supabase
    .from('study_role_definitions')
    .select('id, study_id, can_access_audit_hub')
    .in('id', defIds)

  if (defErr || !defs?.length) return []

  const auditCapable = new Set(
    defs.filter((d) => d.can_access_audit_hub).map((d) => d.id as string)
  )
  if (auditCapable.size === 0) return []

  const studyIds: string[] = []
  for (const a of assigns) {
    if (a.role_definition_id && auditCapable.has(a.role_definition_id)) {
      studyIds.push(a.study_id as string)
    }
  }
  return [...new Set(studyIds)]
}

/** Study delete / destructive record delete: RLS requires admin slug, not creator-only. */
export async function hasStudyAdminRoleOnly(
  userId: string,
  studyId: string
): Promise<boolean> {
  return hasStudyRole(userId, studyId, ['admin'])
}

export async function canManageStudyMembers(
  userId: string,
  studyId: string
): Promise<boolean> {
  const perms = await getStudyMemberPermissions(userId, studyId)
  return Boolean(perms?.can_manage_members)
}

export async function canCommentInStudy(
  userId: string,
  studyId: string
): Promise<boolean> {
  const perms = await getStudyMemberPermissions(userId, studyId)
  return Boolean(perms?.can_view && perms.can_comment)
}

export async function canManageInstitution(
  userId: string,
  institutionId: string
): Promise<boolean> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('institution_members')
    .select('role')
    .eq('institution_id', institutionId)
    .eq('user_id', userId)
    .is('revoked_at', null)
    .maybeSingle()
  return data?.role === 'admin'
}

export async function canCreateStudyInInstitution(
  userId: string,
  institutionId: string
): Promise<boolean> {
  return canManageInstitution(userId, institutionId)
}

export async function getInstitutionIdsWhereUserIsAdmin(
  userId: string
): Promise<string[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('institution_members')
    .select('institution_id')
    .eq('user_id', userId)
    .eq('role', 'admin')
    .is('revoked_at', null)

  if (error || !data?.length) return []
  return [...new Set(data.map((r) => r.institution_id))]
}

export async function canUserCreateStudy(userId: string): Promise<boolean> {
  const ids = await getInstitutionIdsWhereUserIsAdmin(userId)
  return ids.length > 0
}

export async function isActiveInstitutionMember(
  userId: string,
  institutionId: string
): Promise<boolean> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('institution_members')
    .select('id')
    .eq('institution_id', institutionId)
    .eq('user_id', userId)
    .is('revoked_at', null)
    .maybeSingle()
  return Boolean(data)
}
