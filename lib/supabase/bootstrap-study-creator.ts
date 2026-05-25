import { createAdminClient } from '@/lib/supabase/admin'
import {
  getStudyRoleDefinitionIdBySlug,
  type StudyRoleDefinitionRow,
} from '@/lib/supabase/study-roles'

export type BootstrapStudyCreatorResult =
  | { ok: true }
  | { ok: false; error: string }

const ROLE_SEED_MAX_ATTEMPTS = 12
const ROLE_SEED_DELAY_MS = 50

async function waitForAdminRoleDefinitionId(
  admin: ReturnType<typeof createAdminClient>,
  studyId: string
): Promise<string | null> {
  for (let attempt = 0; attempt < ROLE_SEED_MAX_ATTEMPTS; attempt++) {
    const id = await getStudyRoleDefinitionIdBySlug(admin, studyId, 'admin')
    if (id) return id
    if (attempt < ROLE_SEED_MAX_ATTEMPTS - 1) {
      await new Promise((resolve) => setTimeout(resolve, ROLE_SEED_DELAY_MS))
    }
  }
  return null
}

async function loadRoleDefinition(
  admin: ReturnType<typeof createAdminClient>,
  roleDefinitionId: string
): Promise<StudyRoleDefinitionRow | null> {
  const { data, error } = await admin
    .from('study_role_definitions')
    .select('*')
    .eq('id', roleDefinitionId)
    .maybeSingle()

  if (error || !data) return null
  return data as StudyRoleDefinitionRow
}

/**
 * Ensures study_members reflects an active admin assignment (trigger should do this;
 * service-role fallback if sync did not run).
 */
async function ensureStudyMemberRowForAdminAssignment(
  admin: ReturnType<typeof createAdminClient>,
  studyId: string,
  userId: string,
  roleDefinitionId: string,
  grantedBy: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: existing } = await admin
    .from('study_members')
    .select('id')
    .eq('study_id', studyId)
    .eq('user_id', userId)
    .eq('role_definition_id', roleDefinitionId)
    .is('revoked_at', null)
    .maybeSingle()

  if (existing) {
    return { ok: true }
  }

  const def = await loadRoleDefinition(admin, roleDefinitionId)
  if (!def) {
    return { ok: false, error: 'Admin role definition could not be loaded for membership sync.' }
  }

  const { error: insertError } = await admin.from('study_members').insert({
    study_id: studyId,
    user_id: userId,
    role: def.slug,
    granted_by: grantedBy,
    role_definition_id: roleDefinitionId,
    can_view: def.can_view,
    can_comment: def.can_comment,
    can_review: def.can_review,
    can_approve: def.can_approve,
    can_share: def.can_share,
  })

  if (insertError) {
    if (insertError.code === '23505') {
      return { ok: true }
    }
    return { ok: false, error: insertError.message }
  }

  return { ok: true }
}

/**
 * Assigns the study creator as admin and ensures they appear in study_members.
 * Uses service role because RLS hides study_role_definitions until the user is a member.
 */
export async function bootstrapStudyCreatorAsAdmin(
  studyId: string,
  userId: string
): Promise<BootstrapStudyCreatorResult> {
  const admin = createAdminClient()

  const adminDefId = await waitForAdminRoleDefinitionId(admin, studyId)
  if (!adminDefId) {
    return {
      ok: false,
      error:
        'Study roles could not be loaded. Open the study from your list and contact support if membership is missing.',
    }
  }

  const { data: existing } = await admin
    .from('study_member_role_assignments')
    .select('id')
    .eq('study_id', studyId)
    .eq('user_id', userId)
    .eq('role_definition_id', adminDefId)
    .is('revoked_at', null)
    .maybeSingle()

  if (!existing) {
    const { error: assignError } = await admin.from('study_member_role_assignments').insert({
      study_id: studyId,
      user_id: userId,
      role_definition_id: adminDefId,
      granted_by: userId,
    })

    if (assignError) {
      return { ok: false, error: assignError.message }
    }
  }

  const memberSync = await ensureStudyMemberRowForAdminAssignment(
    admin,
    studyId,
    userId,
    adminDefId,
    userId
  )
  if (!memberSync.ok) {
    return { ok: false, error: memberSync.error }
  }

  return { ok: true }
}
