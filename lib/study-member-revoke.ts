import type { SupabaseClient } from '@supabase/supabase-js'
import { createAuditEvent } from '@/lib/supabase/audit'
import { generateHash } from '@/lib/crypto'

export type StudyMemberRow = {
  id: string
  user_id: string
  role: string
  role_definition_id: string | null
}

export function computeRemainingMemberCounts(
  activeRows: Array<{ id: string; user_id: string; role: string }>,
  excludeMemberId: string
): {
  remainingDistinctMemberCount: number
  remainingPrivilegedDistinctUserCount: number
} {
  const remainingUsers = new Set<string>()
  const remainingPrivilegedUsers = new Set<string>()
  for (const r of activeRows) {
    if (r.id === excludeMemberId) continue
    remainingUsers.add(r.user_id)
    if (r.role === 'admin') {
      remainingPrivilegedUsers.add(r.user_id)
    }
  }
  return {
    remainingDistinctMemberCount: remainingUsers.size,
    remainingPrivilegedDistinctUserCount: remainingPrivilegedUsers.size,
  }
}

/** Remove user from open task assignee lists for a single study. */
export async function removeOpenTaskAssigneesForUser(
  admin: SupabaseClient,
  studyId: string,
  userId: string
): Promise<{ ok: true } | { ok: false; message: string }> {
  const { data: openTasks, error: openTasksErr } = await admin
    .from('study_tasks')
    .select('id')
    .eq('study_id', studyId)
    .eq('status', 'open')

  if (openTasksErr) {
    return { ok: false, message: openTasksErr.message }
  }

  const taskIds = (openTasks ?? []).map((t) => t.id as string)
  if (taskIds.length === 0) {
    return { ok: true }
  }

  const { error: delErr } = await admin
    .from('study_task_assignees')
    .delete()
    .eq('user_id', userId)
    .in('task_id', taskIds)

  if (delErr) {
    return { ok: false, message: delErr.message }
  }
  return { ok: true }
}

export async function revokeStudyMemberRow(
  client: SupabaseClient,
  studyId: string,
  member: StudyMemberRow
): Promise<{ ok: true } | { ok: false; message: string }> {
  const now = new Date().toISOString()

  if (member.role_definition_id) {
    const { error: raErr } = await client
      .from('study_member_role_assignments')
      .update({ revoked_at: now })
      .eq('study_id', studyId)
      .eq('user_id', member.user_id)
      .eq('role_definition_id', member.role_definition_id)
      .is('revoked_at', null)

    if (raErr) {
      return { ok: false, message: raErr.message }
    }
  } else {
    const { error } = await client
      .from('study_members')
      .update({ revoked_at: now })
      .eq('id', member.id)
      .eq('study_id', studyId)

    if (error) {
      return { ok: false, message: error.message }
    }
  }

  return { ok: true }
}

export async function emitStudyMemberRemovedAudit(params: {
  studyId: string
  actorUserId: string
  member: StudyMemberRow
  extraMetadata?: Record<string, unknown>
}): Promise<void> {
  const { studyId, actorUserId, member, extraMetadata } = params
  const stateHash = await generateHash({
    study_id: studyId,
    user_id: member.user_id,
    role: member.role,
    revoked_by: actorUserId,
    ...extraMetadata,
  })

  await createAuditEvent(
    studyId,
    actorUserId,
    'member_removed',
    'study_member',
    member.id,
    null,
    stateHash,
    { user_id: member.user_id, role: member.role, ...extraMetadata }
  )
}
