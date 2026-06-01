/**
 * Pure validation for soft-revoking study / institution memberships.
 * Server routes must enforce; these helpers keep messages and logic consistent.
 */

export const STUDY_REVOKE = {
  self: 'You cannot remove yourself. Another study admin must remove you.',
  lastMember: 'Cannot remove the last member of this study.',
  lastPrivileged:
    'Cannot remove the last study admin. Add or promote another admin first.',
} as const

export const STUDY_LEAVE = {
  lastMember: 'You cannot leave because you are the only member of this study.',
  lastPrivileged:
    'You cannot leave because you are the only study admin. Promote another admin first.',
} as const

export const INSTITUTION_REVOKE = {
  self: 'You cannot remove yourself. Another institution admin must remove you.',
  lastMember: 'Cannot remove the last member of this institution.',
  lastAdmin:
    'Cannot remove the last institution admin. Invite or promote another admin first.',
} as const

export function isStudyPrivilegedRole(role: string): boolean {
  return role === 'admin'
}

/**
 * Validates removing a study member.
 * Counts reflect state after that member is removed.
 */
export function validateStudyMemberRevocation(input: {
  actorId: string
  targetUserId: string
  targetRole: string
  /** Distinct users who still have ≥1 active study_members row after this row is removed */
  remainingDistinctMemberCount: number
  /** Distinct users who still have ≥1 admin row after this row is removed */
  remainingPrivilegedDistinctUserCount: number
}): { ok: true } | { ok: false; message: string } {
  const {
    actorId,
    targetUserId,
    targetRole,
    remainingDistinctMemberCount,
    remainingPrivilegedDistinctUserCount,
  } = input

  if (targetUserId === actorId) {
    return { ok: false, message: STUDY_REVOKE.self }
  }
  if (remainingDistinctMemberCount === 0) {
    return { ok: false, message: STUDY_REVOKE.lastMember }
  }
  if (
    isStudyPrivilegedRole(targetRole) &&
    remainingPrivilegedDistinctUserCount === 0
  ) {
    return { ok: false, message: STUDY_REVOKE.lastPrivileged }
  }
  return { ok: true }
}

/**
 * Validates voluntary self-departure from a study.
 * Counts reflect state after the departing member is removed.
 */
export function validateStudyMemberSelfDeparture(input: {
  targetRole: string
  remainingDistinctMemberCount: number
  remainingPrivilegedDistinctUserCount: number
}): { ok: true } | { ok: false; message: string } {
  const {
    targetRole,
    remainingDistinctMemberCount,
    remainingPrivilegedDistinctUserCount,
  } = input

  if (remainingDistinctMemberCount === 0) {
    return { ok: false, message: STUDY_LEAVE.lastMember }
  }
  if (
    isStudyPrivilegedRole(targetRole) &&
    remainingPrivilegedDistinctUserCount === 0
  ) {
    return { ok: false, message: STUDY_LEAVE.lastPrivileged }
  }
  return { ok: true }
}

export function validateInstitutionMemberRevocation(input: {
  actorId: string
  targetUserId: string
  targetRole: string
  activeMemberCount: number
  activeAdminCount: number
}): { ok: true } | { ok: false; message: string } {
  const {
    actorId,
    targetUserId,
    targetRole,
    activeMemberCount,
    activeAdminCount,
  } = input

  if (targetUserId === actorId) {
    return { ok: false, message: INSTITUTION_REVOKE.self }
  }
  if (activeMemberCount <= 1) {
    return { ok: false, message: INSTITUTION_REVOKE.lastMember }
  }
  if (targetRole === 'admin' && activeAdminCount <= 1) {
    return { ok: false, message: INSTITUTION_REVOKE.lastAdmin }
  }
  return { ok: true }
}
