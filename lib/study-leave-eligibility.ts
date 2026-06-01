import {
  isStudyPrivilegedRole,
  validateStudyMemberSelfDeparture,
} from '@/lib/supabase/member-revocation'
import { computeRemainingMemberCounts } from '@/lib/study-member-revoke'

type ActiveMemberRow = { id: string; user_id: string; role: string }

/**
 * Whether the current user can voluntarily leave a study, and why not if blocked.
 */
export function getStudyLeaveEligibility(
  userId: string,
  activeRows: ActiveMemberRow[]
): { canLeave: boolean; disabledReason: string | null } {
  const member = activeRows.find((r) => r.user_id === userId)
  if (!member) {
    return { canLeave: false, disabledReason: 'You are not an active member of this study.' }
  }

  const counts = computeRemainingMemberCounts(activeRows, member.id)
  const decision = validateStudyMemberSelfDeparture({
    targetRole: member.role,
    ...counts,
  })

  if (!decision.ok) {
    return { canLeave: false, disabledReason: decision.message }
  }

  return { canLeave: true, disabledReason: null }
}

export { isStudyPrivilegedRole }
