import { describe, expect, it, vi, beforeEach } from 'vitest'
import {
  institutionRequiresFreshEmailForAuditorInvites,
  parseRequireFreshAuditorEmailFromForm,
} from '@/lib/auditor/auditor-invite-policy'
import { validateAuditorInviteEligibility } from '@/lib/auditor/auditor-invite-eligibility'

vi.mock('@/lib/supabase/find-user-by-email', () => ({
  findUserIdByEmail: vi.fn(),
}))

import { findUserIdByEmail } from '@/lib/supabase/find-user-by-email'

const mockFindUserIdByEmail = vi.mocked(findUserIdByEmail)

function mockSupabase(options: {
  institutionMember?: boolean
  studyMemberStudyIds?: string[]
  institutionStudies?: string[]
}) {
  const institutionMembersChain = {
    eq: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({
      data: options.institutionMember ? { id: 'im-1' } : null,
    }),
    select: vi.fn().mockReturnThis(),
  }
  institutionMembersChain.select.mockImplementation(() => institutionMembersChain)
  institutionMembersChain.eq.mockImplementation(() => institutionMembersChain)

  const studiesChain = {
    eq: vi.fn().mockResolvedValue({
      data: (options.institutionStudies ?? ['study-1', 'study-2']).map((id) => ({ id })),
      error: null,
    }),
    select: vi.fn().mockReturnThis(),
  }
  studiesChain.select.mockImplementation(() => studiesChain)

  const assignmentsChain = {
    eq: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    in: vi.fn().mockResolvedValue({
      data: (options.studyMemberStudyIds ?? []).map((study_id) => ({ study_id })),
      error: null,
    }),
    select: vi.fn().mockReturnThis(),
  }
  assignmentsChain.select.mockImplementation(() => assignmentsChain)
  assignmentsChain.eq.mockImplementation(() => assignmentsChain)
  assignmentsChain.is.mockImplementation(() => assignmentsChain)

  return {
    from: vi.fn((table: string) => {
      if (table === 'institution_members') return institutionMembersChain
      if (table === 'studies') return studiesChain
      if (table === 'study_member_role_assignments') return assignmentsChain
      return institutionMembersChain
    }),
  } as never
}

describe('auditor-invite-policy', () => {
  it('defaults fresh email requirement to false', () => {
    expect(institutionRequiresFreshEmailForAuditorInvites(null)).toBe(false)
    expect(institutionRequiresFreshEmailForAuditorInvites({})).toBe(false)
  })

  it('reads fresh email requirement from metadata', () => {
    expect(
      institutionRequiresFreshEmailForAuditorInvites({ auditor_invites_require_fresh_email: true })
    ).toBe(true)
  })

  it('parses form values', () => {
    expect(parseRequireFreshAuditorEmailFromForm('true')).toBe(true)
    expect(parseRequireFreshAuditorEmailFromForm('false')).toBe(false)
  })
})

describe('validateAuditorInviteEligibility', () => {
  const admin = {} as never

  beforeEach(() => {
    mockFindUserIdByEmail.mockReset()
  })

  it('allows unknown email without account', async () => {
    mockFindUserIdByEmail.mockResolvedValue(null)
    const supabase = mockSupabase({})
    const result = await validateAuditorInviteEligibility({
      institutionId: 'inst-1',
      auditorEmail: 'new@auditfirm.com',
      scope: 'institution_wide',
      studyIds: [],
      supabase,
      admin,
    })
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.existingUserId).toBeNull()
  })

  it('rejects fresh-email policy when account exists', async () => {
    mockFindUserIdByEmail.mockResolvedValue('user-1')
    const supabase = mockSupabase({ institutionMember: false })
    const result = await validateAuditorInviteEligibility({
      institutionId: 'inst-1',
      auditorEmail: 'exists@example.com',
      scope: 'institution_wide',
      studyIds: [],
      institutionMetadata: { auditor_invites_require_fresh_email: true },
      supabase,
      admin,
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.code).toBe('existing_account_not_allowed')
  })

  it('rejects institution members of same institution', async () => {
    mockFindUserIdByEmail.mockResolvedValue('user-1')
    const supabase = mockSupabase({ institutionMember: true })
    const result = await validateAuditorInviteEligibility({
      institutionId: 'inst-1',
      auditorEmail: 'member@org.edu',
      scope: 'institution_wide',
      studyIds: [],
      supabase,
      admin,
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.code).toBe('institution_member_conflict')
  })

  it('rejects study collaborators in scope without override', async () => {
    mockFindUserIdByEmail.mockResolvedValue('user-1')
    const supabase = mockSupabase({
      institutionMember: false,
      studyMemberStudyIds: ['study-1'],
      institutionStudies: ['study-1'],
    })
    const result = await validateAuditorInviteEligibility({
      institutionId: 'inst-1',
      auditorEmail: 'collab@external.com',
      scope: 'institution_wide',
      studyIds: [],
      supabase,
      admin,
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.code).toBe('study_member_conflict')
      expect(result.details?.study_ids).toEqual(['study-1'])
    }
  })

  it('allows study collaborator with override and reason', async () => {
    mockFindUserIdByEmail.mockResolvedValue('user-1')
    const supabase = mockSupabase({
      institutionMember: false,
      studyMemberStudyIds: ['study-1'],
      institutionStudies: ['study-1'],
    })
    const result = await validateAuditorInviteEligibility({
      institutionId: 'inst-1',
      auditorEmail: 'collab@external.com',
      scope: 'specific_studies',
      studyIds: ['study-1'],
      supabase,
      admin,
      overrideStudyMemberConflict: true,
      overrideReason: 'Internal QA audit with segregated credentials',
    })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.studyMemberConflictOverridden).toBe(true)
      expect(result.conflictingStudyIds).toEqual(['study-1'])
    }
  })

  it('allows existing external account with no membership conflicts', async () => {
    mockFindUserIdByEmail.mockResolvedValue('user-ext')
    const supabase = mockSupabase({ institutionMember: false, studyMemberStudyIds: [] })
    const result = await validateAuditorInviteEligibility({
      institutionId: 'inst-1',
      auditorEmail: 'auditor@otherfirm.com',
      scope: 'institution_wide',
      studyIds: [],
      supabase,
      admin,
    })
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.existingUserId).toBe('user-ext')
  })
})
