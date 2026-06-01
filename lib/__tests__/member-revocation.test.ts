import { describe, expect, it } from 'vitest'
import {
  isStudyPrivilegedRole,
  STUDY_LEAVE,
  STUDY_REVOKE,
  validateStudyMemberRevocation,
  validateStudyMemberSelfDeparture,
} from '@/lib/supabase/member-revocation'

describe('isStudyPrivilegedRole', () => {
  it('treats admin as privileged', () => {
    expect(isStudyPrivilegedRole('admin')).toBe(true)
  })

  it('does not treat member or legacy creator slug as privileged', () => {
    expect(isStudyPrivilegedRole('member')).toBe(false)
    expect(isStudyPrivilegedRole('reviewer')).toBe(false)
    expect(isStudyPrivilegedRole('creator')).toBe(false)
  })
})

describe('validateStudyMemberRevocation', () => {
  const actorId = 'actor-1'
  const targetUserId = 'target-1'

  it('blocks removing the last privileged user', () => {
    const result = validateStudyMemberRevocation({
      actorId,
      targetUserId,
      targetRole: 'admin',
      remainingDistinctMemberCount: 1,
      remainingPrivilegedDistinctUserCount: 0,
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.message).toBe(STUDY_REVOKE.lastPrivileged)
    }
  })

  it('allows removing admin when another privileged user remains', () => {
    const result = validateStudyMemberRevocation({
      actorId,
      targetUserId,
      targetRole: 'admin',
      remainingDistinctMemberCount: 2,
      remainingPrivilegedDistinctUserCount: 1,
    })
    expect(result.ok).toBe(true)
  })
})

describe('validateStudyMemberSelfDeparture', () => {
  it('blocks last member from leaving', () => {
    const result = validateStudyMemberSelfDeparture({
      targetRole: 'member',
      remainingDistinctMemberCount: 0,
      remainingPrivilegedDistinctUserCount: 0,
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.message).toBe(STUDY_LEAVE.lastMember)
    }
  })

  it('blocks last admin from leaving', () => {
    const result = validateStudyMemberSelfDeparture({
      targetRole: 'admin',
      remainingDistinctMemberCount: 1,
      remainingPrivilegedDistinctUserCount: 0,
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.message).toBe(STUDY_LEAVE.lastPrivileged)
    }
  })

  it('allows non-admin member to leave when others remain', () => {
    const result = validateStudyMemberSelfDeparture({
      targetRole: 'member',
      remainingDistinctMemberCount: 2,
      remainingPrivilegedDistinctUserCount: 1,
    })
    expect(result.ok).toBe(true)
  })

  it('allows admin to leave when another admin remains', () => {
    const result = validateStudyMemberSelfDeparture({
      targetRole: 'admin',
      remainingDistinctMemberCount: 2,
      remainingPrivilegedDistinctUserCount: 1,
    })
    expect(result.ok).toBe(true)
  })
})

describe('validateStudyMemberRevocation self-block', () => {
  it('blocks admin from removing themselves via admin flow', () => {
    const result = validateStudyMemberRevocation({
      actorId: 'user-1',
      targetUserId: 'user-1',
      targetRole: 'admin',
      remainingDistinctMemberCount: 1,
      remainingPrivilegedDistinctUserCount: 0,
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.message).toBe(STUDY_REVOKE.self)
    }
  })
})
