/**
 * Study collaboration policy: who may join studies as collaborators (study_members).
 *
 * Governed by institutions.metadata.allow_external_collaborators (see
 * lib/institution-collaboration.ts). When false, study collaborators must be
 * active institution members.
 *
 * OUT OF SCOPE: audit_engagements (time-boxed read-only auditor grants issued by
 * institution admins). Auditors are never study_members and are not subject to this
 * policy. Do not call these helpers from audit engagement issue/accept paths.
 */

import { ALLOW_EXTERNAL_COLLABORATORS_KEY } from '@/lib/institution-collaboration'
import { isActiveInstitutionMember } from '@/lib/supabase/permissions'

/** Metadata key for study collaborator policy (study_members only). */
export const STUDY_COLLABORATION_POLICY_KEY = ALLOW_EXTERNAL_COLLABORATORS_KEY

export const STUDY_COLLABORATION_MEMBERS_ONLY_MESSAGE =
  'This institution requires everyone on a study to be an institution member first. Invite them to the institution (and wait for acceptance), or enable external collaborators in institution settings.'

export const STUDY_COLLABORATION_MEMBERS_ONLY_ACCEPT_MESSAGE =
  "This study's institution only allows institution members on studies. Ask an admin to invite you to the institution and accept that invite first, then return here to accept the study invite."

export function institutionMembersOnlyStudyCollaboration(params: {
  institutionId: string | null
  allowExternalCollaborators: boolean
}): boolean {
  return Boolean(params.institutionId && !params.allowExternalCollaborators)
}

/**
 * True when the user cannot join or be added as a study collaborator because the
 * institution requires institution membership and the user is not a member.
 */
export async function studyCollaborationBlockedByMembersOnlyPolicy(params: {
  allowExternalCollaborators: boolean
  institutionId: string | null
  userId: string
}): Promise<boolean> {
  if (!institutionMembersOnlyStudyCollaboration(params)) return false
  return !(await isActiveInstitutionMember(params.userId, params.institutionId!))
}
