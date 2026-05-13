import { describe, expect, it } from 'vitest'
import { getEngagementStatus, isEngagementUsable } from '@/lib/auditor/engagements'

const baseRow = {
  starts_at: '2026-05-01T00:00:00.000Z',
  expires_at: '2026-06-01T00:00:00.000Z',
  accepted_at: null as string | null,
  revoked_at: null as string | null,
}

describe('getEngagementStatus', () => {
  it('returns revoked when revoked_at is set, regardless of other fields', () => {
    expect(
      getEngagementStatus(
        { ...baseRow, accepted_at: '2026-05-02T00:00:00Z', revoked_at: '2026-05-03T00:00:00Z' },
        new Date('2026-05-15T00:00:00Z')
      )
    ).toBe('revoked')
  })

  it('returns expired when now >= expires_at', () => {
    expect(
      getEngagementStatus(
        { ...baseRow, accepted_at: '2026-05-02T00:00:00Z' },
        new Date('2026-06-15T00:00:00Z')
      )
    ).toBe('expired')
  })

  it('returns pending when accepted_at is null and not expired', () => {
    expect(
      getEngagementStatus(baseRow, new Date('2026-05-15T00:00:00Z'))
    ).toBe('pending')
  })

  it('returns pending when starts_at is in the future even if accepted', () => {
    expect(
      getEngagementStatus(
        {
          ...baseRow,
          accepted_at: '2026-04-15T00:00:00Z',
        },
        new Date('2026-04-29T00:00:00Z')
      )
    ).toBe('pending')
  })

  it('returns active when accepted, started, not expired, and not revoked', () => {
    expect(
      getEngagementStatus(
        { ...baseRow, accepted_at: '2026-05-02T00:00:00Z' },
        new Date('2026-05-15T00:00:00Z')
      )
    ).toBe('active')
  })
})

describe('isEngagementUsable', () => {
  it('is true only for active engagements', () => {
    const now = new Date('2026-05-15T00:00:00Z')
    expect(isEngagementUsable({ ...baseRow, accepted_at: '2026-05-02T00:00:00Z' }, now)).toBe(true)
    expect(isEngagementUsable(baseRow, now)).toBe(false)
    expect(
      isEngagementUsable(
        { ...baseRow, accepted_at: '2026-05-02T00:00:00Z', revoked_at: '2026-05-04T00:00:00Z' },
        now
      )
    ).toBe(false)
    expect(
      isEngagementUsable(
        { ...baseRow, accepted_at: '2026-05-02T00:00:00Z' },
        new Date('2026-07-01T00:00:00Z')
      )
    ).toBe(false)
  })
})
