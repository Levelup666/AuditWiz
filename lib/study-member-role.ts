import type { SupabaseClient } from '@supabase/supabase-js'
import { createAuditEvent } from '@/lib/supabase/audit'
import { generateHash } from '@/lib/crypto'
import {
  getStudyRoleDefinitionIdBySlug,
  isAssignableStudyRoleSlug,
} from '@/lib/supabase/study-roles'
import {
  isStudyPrivilegedRole,
  validateStudyMemberRevocation,
} from '@/lib/supabase/member-revocation'

export async function userHasActiveStudyAssignment(
  supabase: SupabaseClient,
  studyId: string,
  userId: string
): Promise<boolean> {
  const { count, error } = await supabase
    .from('study_member_role_assignments')
    .select('*', { count: 'exact', head: true })
    .eq('study_id', studyId)
    .eq('user_id', userId)
    .is('revoked_at', null)
  if (error) {
    throw new Error(error.message)
  }
  return (count ?? 0) > 0
}

export async function changeStudyMemberRole(
  supabase: SupabaseClient,
  params: {
    studyId: string
    actorUserId: string
    targetUserId: string
    roleSlug: string
  }
): Promise<{ ok: true; unchanged?: boolean } | { ok: false; error: string; status: number }> {
  const { studyId, actorUserId, targetUserId, roleSlug } = params
  const slug = roleSlug.trim()
  if (!isAssignableStudyRoleSlug(slug)) {
    return { ok: false, error: 'Invalid or deprecated role', status: 400 }
  }

  const roleDefId = await getStudyRoleDefinitionIdBySlug(supabase, studyId, slug)
  if (!roleDefId) {
    return { ok: false, error: 'Invalid role', status: 400 }
  }

  const { data: assignment, error: fetchErr } = await supabase
    .from('study_member_role_assignments')
    .select('id, role_definition_id')
    .eq('study_id', studyId)
    .eq('user_id', targetUserId)
    .is('revoked_at', null)
    .maybeSingle()

  if (fetchErr) {
    return { ok: false, error: fetchErr.message, status: 500 }
  }
  if (!assignment) {
    return { ok: false, error: 'Member not found', status: 404 }
  }
  if (assignment.role_definition_id === roleDefId) {
    return { ok: true, unchanged: true }
  }

  const { data: prevDef } = await supabase
    .from('study_role_definitions')
    .select('slug')
    .eq('id', assignment.role_definition_id)
    .maybeSingle()

  if (isStudyPrivilegedRole(prevDef?.slug ?? '')) {
    const { data: activeRows, error: countErr } = await supabase
      .from('study_members')
      .select('id, user_id, role')
      .eq('study_id', studyId)
      .is('revoked_at', null)

    if (countErr) {
      return { ok: false, error: countErr.message, status: 500 }
    }

    const remainingUsers = new Set<string>()
    const remainingPrivilegedUsers = new Set<string>()
    for (const r of activeRows ?? []) {
      if (r.user_id === targetUserId) continue
      remainingUsers.add(r.user_id)
      if (isStudyPrivilegedRole(r.role)) {
        remainingPrivilegedUsers.add(r.user_id)
      }
    }

    const decision = validateStudyMemberRevocation({
      actorId: actorUserId,
      targetUserId,
      targetRole: prevDef?.slug ?? 'admin',
      remainingDistinctMemberCount: remainingUsers.size,
      remainingPrivilegedDistinctUserCount: remainingPrivilegedUsers.size,
    })

    if (!decision.ok) {
      return { ok: false, error: decision.message, status: 403 }
    }
  }

  const { error: updateErr } = await supabase
    .from('study_member_role_assignments')
    .update({ role_definition_id: roleDefId })
    .eq('id', assignment.id)
    .is('revoked_at', null)

  if (updateErr) {
    return { ok: false, error: updateErr.message, status: 500 }
  }

  const stateHash = await generateHash({
    study_id: studyId,
    user_id: targetUserId,
    previous_role: prevDef?.slug ?? null,
    next_role: slug,
    changed_by: actorUserId,
  })

  await createAuditEvent(
    studyId,
    actorUserId,
    'member_role_changed',
    'study_member',
    targetUserId,
    null,
    stateHash,
    { user_id: targetUserId, previous_role: prevDef?.slug ?? null, next_role: slug }
  )

  return { ok: true }
}
