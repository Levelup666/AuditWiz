import { describe, expect, it, vi, beforeEach } from 'vitest'
import { userIsAuditorPrimary, userIsDualRoleAuditor } from '@/lib/auditor/is-auditor-primary'

vi.mock('@/lib/auditor/engagements', () => ({
  userHasActiveEngagement: vi.fn(),
}))

import { userHasActiveEngagement } from '@/lib/auditor/engagements'

const mockHasEngagement = vi.mocked(userHasActiveEngagement)

function mockSupabase(opts: { inst?: number; study?: number }) {
  const chain = {
    eq: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
  }
  let call = 0
  chain.select.mockImplementation(() => {
    call += 1
    const count = call === 1 ? (opts.inst ?? 0) : (opts.study ?? 0)
    chain.is.mockResolvedValue({ count, error: null })
    return chain
  })
  return { from: vi.fn(() => chain) } as never
}

describe('userIsAuditorPrimary', () => {
  beforeEach(() => {
    mockHasEngagement.mockReset()
  })

  it('is false when user has institution membership', async () => {
    mockHasEngagement.mockResolvedValue(true)
    const supabase = mockSupabase({ inst: 1, study: 0 })
    await expect(userIsAuditorPrimary(supabase, 'u1')).resolves.toBe(false)
    expect(mockHasEngagement).not.toHaveBeenCalled()
  })

  it('is false when user has study membership only', async () => {
    mockHasEngagement.mockResolvedValue(true)
    const supabase = mockSupabase({ inst: 0, study: 1 })
    await expect(userIsAuditorPrimary(supabase, 'u1')).resolves.toBe(false)
  })

  it('is true when active engagement and no memberships', async () => {
    mockHasEngagement.mockResolvedValue(true)
    const supabase = mockSupabase({ inst: 0, study: 0 })
    await expect(userIsAuditorPrimary(supabase, 'u1')).resolves.toBe(true)
  })

  it('is false when no engagement', async () => {
    mockHasEngagement.mockResolvedValue(false)
    const supabase = mockSupabase({ inst: 0, study: 0 })
    await expect(userIsAuditorPrimary(supabase, 'u1')).resolves.toBe(false)
  })
})

describe('userIsDualRoleAuditor', () => {
  beforeEach(() => {
    mockHasEngagement.mockReset()
  })

  it('is true when membership and engagement', async () => {
    mockHasEngagement.mockResolvedValue(true)
    const supabase = mockSupabase({ inst: 1, study: 0 })
    await expect(userIsDualRoleAuditor(supabase, 'u1')).resolves.toBe(true)
  })

  it('is false without membership', async () => {
    mockHasEngagement.mockResolvedValue(true)
    const supabase = mockSupabase({ inst: 0, study: 0 })
    await expect(userIsDualRoleAuditor(supabase, 'u1')).resolves.toBe(false)
    expect(mockHasEngagement).not.toHaveBeenCalled()
  })
})
