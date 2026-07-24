import type { SupabaseClient } from '@supabase/supabase-js'
import { institutionRequiresFreshEmailForAuditorInvites } from '@/lib/auditor/auditor-invite-policy'
import { findUserIdByEmail } from '@/lib/supabase/find-user-by-email'
import type { EngagementScope } from '@/lib/auditor/issue-audit-engagement'

export type AuditorInviteEligibilityInput = {
  institutionId: string
  auditorEmail: string
  scope: EngagementScope
  studyIds: string[]
  institutionMetadata?: unknown
  supabase: SupabaseClient
  admin: SupabaseClient
  overrideStudyMemberConflict?: boolean
  overrideReason?: string
}

export type AuditorInviteEligibilitySuccess = {
  ok: true
  existingUserId: string | null
  studyMemberConflictOverridden: boolean
  conflictingStudyIds: string[]
}

export type AuditorInviteEligibilityFailure = {
  ok: false
  status: number
  error: string
  code:
    | 'institution_member_conflict'
    | 'study_member_conflict'
    | 'existing_account_not_allowed'
  details?: Record<string, unknown>
}

export type AuditorInviteEligibilityResult =
  | AuditorInviteEligibilitySuccess
  | AuditorInviteEligibilityFailure

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

async function resolveScopedStudyIds(
  supabase: SupabaseClient,
  institutionId: string,
  scope: EngagementScope,
  studyIds: string[]
): Promise<string[]> {
  if (scope === 'specific_studies') {
    return [...new Set(studyIds.filter(Boolean))]
  }
  const { data, error } = await supabase
    .from('studies')
    .select('id')
    .eq('institution_id', institutionId)
  if (error) {
    throw new Error(error.message)
  }
  return (data ?? []).map((r) => r.id as string)
}

async function isActiveInstitutionMember(
  supabase: SupabaseClient,
  institutionId: string,
  userId: string
): Promise<boolean> {
  const { data } = await supabase
    .from('institution_members')
    .select('id')
    .eq('institution_id', institutionId)
    .eq('user_id', userId)
    .is('revoked_at', null)
    .maybeSingle()
  return Boolean(data)
}

async function activeStudyMemberStudyIds(
  supabase: SupabaseClient,
  userId: string,
  studyIds: string[]
): Promise<string[]> {
  if (studyIds.length === 0) return []
  const { data, error } = await supabase
    .from('study_member_role_assignments')
    .select('study_id')
    .eq('user_id', userId)
    .is('revoked_at', null)
    .in('study_id', studyIds)
  if (error) {
    throw new Error(error.message)
  }
  return [...new Set((data ?? []).map((r) => r.study_id as string))]
}

/**
 * Validates whether an email may receive an audit engagement invite for this institution.
 * Auditors must not be active institution members of the same institution. Study collaborators
 * in scope are blocked unless the admin supplies an override reason (logged on grant).
 */
export async function validateAuditorInviteEligibility(
  input: AuditorInviteEligibilityInput
): Promise<AuditorInviteEligibilityResult> {
  const {
    institutionId,
    auditorEmail,
    scope,
    studyIds,
    institutionMetadata,
    supabase,
    admin,
    overrideStudyMemberConflict = false,
    overrideReason = '',
  } = input

  const emailNorm = normalizeEmail(auditorEmail)
  if (!emailNorm) {
    return {
      ok: false,
      status: 400,
      error: 'Auditor email is required.',
      code: 'existing_account_not_allowed',
    }
  }

  const existingUserId = await findUserIdByEmail(admin, auditorEmail.trim())
  const requireFreshEmail = institutionRequiresFreshEmailForAuditorInvites(institutionMetadata)

  if (requireFreshEmail && existingUserId) {
    return {
      ok: false,
      status: 403,
      error:
        'This institution requires auditor invites to use an email with no existing AuditWiz account. Use a dedicated auditor address or change the setting under Institution settings.',
      code: 'existing_account_not_allowed',
    }
  }

  if (!existingUserId) {
    return {
      ok: true,
      existingUserId: null,
      studyMemberConflictOverridden: false,
      conflictingStudyIds: [],
    }
  }

  if (await isActiveInstitutionMember(supabase, institutionId, existingUserId)) {
    return {
      ok: false,
      status: 403,
      error:
        'This email belongs to an active member of this institution. Institution members cannot be invited as external auditors. Use a separate email for the audit firm or revoke their institution membership first.',
      code: 'institution_member_conflict',
      details: { user_id: existingUserId },
    }
  }

  const scopedStudyIds = await resolveScopedStudyIds(
    supabase,
    institutionId,
    scope,
    studyIds
  )
  const conflictingStudyIds = await activeStudyMemberStudyIds(
    supabase,
    existingUserId,
    scopedStudyIds
  )

  if (conflictingStudyIds.length > 0) {
    if (!overrideStudyMemberConflict) {
      return {
        ok: false,
        status: 409,
        error:
          'This email belongs to someone who is already a study collaborator on one or more studies in scope. External auditors should use a dedicated email, or confirm an intentional override with a documented reason.',
        code: 'study_member_conflict',
        details: {
          user_id: existingUserId,
          study_ids: conflictingStudyIds,
        },
      }
    }

    const reason = overrideReason.trim()
    if (!reason) {
      return {
        ok: false,
        status: 400,
        error:
          'Provide a reason when overriding a study member conflict (for example: internal QA audit with segregated credentials).',
        code: 'study_member_conflict',
      }
    }
  }

  return {
    ok: true,
    existingUserId,
    studyMemberConflictOverridden: conflictingStudyIds.length > 0 && overrideStudyMemberConflict,
    conflictingStudyIds,
  }
}
