import type { SupabaseClient } from '@supabase/supabase-js'
import { institutionAllowsExternalCollaborators } from '@/lib/institution-collaboration'
import { createAuditEvent } from '@/lib/supabase/audit'
import { generateHash } from '@/lib/crypto'

/** Studies where removing institution membership should also end study participation (non-terminal). */
const STUDY_STATUSES_FOR_INSTITUTION_CASCADE = ['draft', 'active'] as const

export type InstitutionRemovalImpactStudy = {
  study_id: string
  study_title: string
  roles: string[]
}

export type InstitutionMemberRemovalImpact = {
  /** True when the institution only allows institution members on studies (external collaborators off). */
  applies: boolean
  studies: InstitutionRemovalImpactStudy[]
  openTaskAssigneeCount: number
}

export async function institutionMembersOnlyStudyPolicy(
  admin: SupabaseClient,
  institutionId: string
): Promise<boolean> {
  const { data } = await admin.from('institutions').select('metadata').eq('id', institutionId).maybeSingle()
  return !institutionAllowsExternalCollaborators(data?.metadata ?? null)
}

export async function getInstitutionMemberRemovalImpact(
  admin: SupabaseClient,
  institutionId: string,
  targetUserId: string
): Promise<InstitutionMemberRemovalImpact> {
  const membersOnly = await institutionMembersOnlyStudyPolicy(admin, institutionId)
  if (!membersOnly) {
    return { applies: false, studies: [], openTaskAssigneeCount: 0 }
  }

  const { data: studies } = await admin
    .from('studies')
    .select('id, title')
    .eq('institution_id', institutionId)
    .in('status', [...STUDY_STATUSES_FOR_INSTITUTION_CASCADE])

  const studyRows = studies ?? []
  const studyIds = studyRows.map((s) => s.id)
  const titleById = new Map(studyRows.map((s) => [s.id, (s.title as string) || 'Study']))

  if (studyIds.length === 0) {
    return { applies: true, studies: [], openTaskAssigneeCount: 0 }
  }

  const { data: memberships } = await admin
    .from('study_members')
    .select('study_id, role')
    .eq('user_id', targetUserId)
    .is('revoked_at', null)
    .in('study_id', studyIds)

  const rolesByStudy = new Map<string, string[]>()
  for (const m of memberships ?? []) {
    const sid = m.study_id as string
    const list = rolesByStudy.get(sid) ?? []
    list.push(String(m.role))
    rolesByStudy.set(sid, list)
  }

  const studiesImpact: InstitutionRemovalImpactStudy[] = []
  for (const [study_id, roles] of rolesByStudy) {
    studiesImpact.push({
      study_id,
      study_title: titleById.get(study_id) ?? 'Study',
      roles,
    })
  }
  studiesImpact.sort((a, b) => a.study_title.localeCompare(b.study_title))

  const { data: openTasks } = await admin
    .from('study_tasks')
    .select('id')
    .in('study_id', studyIds)
    .eq('status', 'open')

  const taskIds = (openTasks ?? []).map((t) => t.id as string)
  let openTaskAssigneeCount = 0
  if (taskIds.length > 0) {
    const { count, error } = await admin
      .from('study_task_assignees')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', targetUserId)
      .in('task_id', taskIds)
    if (!error) openTaskAssigneeCount = count ?? 0
  }

  return { applies: true, studies: studiesImpact, openTaskAssigneeCount }
}

/**
 * For members-only institutions: revoke all study participation for this user under the institution,
 * remove them from assignee lists on open tasks, and append member_removed audit events (records and
 * prior audit rows are not modified).
 */
export async function revokeStudyAccessForRemovedInstitutionMember(params: {
  admin: SupabaseClient
  actorUserId: string
  institutionId: string
  targetUserId: string
}): Promise<{ ok: true } | { ok: false; message: string }> {
  const { admin, actorUserId, institutionId, targetUserId } = params

  const membersOnly = await institutionMembersOnlyStudyPolicy(admin, institutionId)
  if (!membersOnly) return { ok: true }

  const { data: studies } = await admin
    .from('studies')
    .select('id')
    .eq('institution_id', institutionId)
    .in('status', [...STUDY_STATUSES_FOR_INSTITUTION_CASCADE])

  const studyIds = (studies ?? []).map((s) => s.id as string)
  if (studyIds.length === 0) return { ok: true }

  const { data: openTasks, error: openTasksErr } = await admin
    .from('study_tasks')
    .select('id')
    .in('study_id', studyIds)
    .eq('status', 'open')

  if (openTasksErr) return { ok: false, message: openTasksErr.message }

  const taskIds = (openTasks ?? []).map((t) => t.id as string)
  if (taskIds.length > 0) {
    const { error: delErr } = await admin
      .from('study_task_assignees')
      .delete()
      .eq('user_id', targetUserId)
      .in('task_id', taskIds)
    if (delErr) return { ok: false, message: delErr.message }
  }

  const { data: memberRows, error: smErr } = await admin
    .from('study_members')
    .select('id, study_id, role, role_definition_id')
    .eq('user_id', targetUserId)
    .is('revoked_at', null)
    .in('study_id', studyIds)

  if (smErr) return { ok: false, message: smErr.message }

  const now = new Date().toISOString()
  for (const row of memberRows ?? []) {
    if (row.role_definition_id) {
      const { error: raErr } = await admin
        .from('study_member_role_assignments')
        .update({ revoked_at: now })
        .eq('study_id', row.study_id as string)
        .eq('user_id', targetUserId)
        .eq('role_definition_id', row.role_definition_id as string)
        .is('revoked_at', null)
      if (raErr) return { ok: false, message: raErr.message }
    } else {
      const { error: uErr } = await admin
        .from('study_members')
        .update({ revoked_at: now })
        .eq('id', row.id as string)
        .eq('study_id', row.study_id as string)
      if (uErr) return { ok: false, message: uErr.message }
    }

    try {
      const stateHash = await generateHash({
        study_id: row.study_id,
        user_id: targetUserId,
        role: row.role,
        revoked_by: actorUserId,
        reason: 'institution_member_removed',
      })
      await createAuditEvent(
        row.study_id as string,
        actorUserId,
        'member_removed',
        'study_member',
        row.id as string,
        null,
        stateHash,
        {
          user_id: targetUserId,
          role: row.role,
          reason: 'institution_member_removed',
          institution_id: institutionId,
        }
      )
    } catch (e) {
      return { ok: false, message: e instanceof Error ? e.message : 'Failed to record study member removal' }
    }
  }

  return { ok: true }
}
