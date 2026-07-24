import { describe, expect, it, vi, beforeEach } from 'vitest'

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

vi.mock('@/lib/auditor/engagements', () => ({
  getEngagementStudyIdsForUser: vi.fn(),
  isAuditorScopedToStudy: vi.fn(),
}))

import { canAuditRecord } from '@/lib/supabase/permissions'
import { createClient } from '@/lib/supabase/server'
import { isAuditorScopedToStudy } from '@/lib/auditor/engagements'

const mockCreateClient = vi.mocked(createClient)
const mockIsAuditorScopedToStudy = vi.mocked(isAuditorScopedToStudy)

function mockSupabaseForMemberPermissions(perms: {
  can_access_audit_hub?: boolean
} | null) {
  const assignmentsChain = {
    eq: vi.fn().mockReturnThis(),
    is: vi.fn().mockResolvedValue({
      data:
        perms === null
          ? []
          : [{ role_definition_id: 'def-1' }],
      error: null,
    }),
    select: vi.fn().mockReturnThis(),
  }
  assignmentsChain.select.mockImplementation(() => assignmentsChain)
  assignmentsChain.eq.mockImplementation(() => assignmentsChain)

  const defChain = {
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockResolvedValue({
      data:
        perms === null
          ? []
          : [
              {
                id: 'def-1',
                study_id: 'study-1',
                slug: 'auditor',
                sort_order: 0,
                ...perms,
              },
            ],
      error: null,
    }),
    select: vi.fn().mockReturnThis(),
  }
  defChain.select.mockImplementation(() => defChain)
  defChain.eq.mockImplementation(() => defChain)

  mockCreateClient.mockResolvedValue({
    from: vi.fn((table: string) => {
      if (table === 'study_member_role_assignments') return assignmentsChain
      if (table === 'study_role_definitions') return defChain
      return assignmentsChain
    }),
  } as never)
}

describe('canAuditRecord', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockIsAuditorScopedToStudy.mockResolvedValue(false)
  })

  it('returns true when study member has audit hub access', async () => {
    mockSupabaseForMemberPermissions({ can_access_audit_hub: true })
    await expect(canAuditRecord('user-1', 'study-1')).resolves.toBe(true)
    expect(mockIsAuditorScopedToStudy).not.toHaveBeenCalled()
  })

  it('returns true for engagement-scoped auditor without membership', async () => {
    mockSupabaseForMemberPermissions(null)
    mockIsAuditorScopedToStudy.mockResolvedValue(true)
    await expect(canAuditRecord('user-1', 'study-1')).resolves.toBe(true)
    expect(mockIsAuditorScopedToStudy).toHaveBeenCalledWith('user-1', 'study-1')
  })

  it('returns false without membership or engagement scope', async () => {
    mockSupabaseForMemberPermissions(null)
    mockIsAuditorScopedToStudy.mockResolvedValue(false)
    await expect(canAuditRecord('user-1', 'study-1')).resolves.toBe(false)
  })
})
