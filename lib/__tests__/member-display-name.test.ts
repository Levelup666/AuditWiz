import { describe, expect, it } from 'vitest'
import { formatMemberListName, profileDisplayNameForDb } from '@/lib/profile/member-display-name'

describe('formatMemberListName', () => {
  it('uses nickname when set', () => {
    expect(
      formatMemberListName({
        nickname: '  Doc  ',
        first_name: 'Jane',
        last_name: 'Smith',
      })
    ).toBe('Doc')
  })

  it('uses First L. when first and last set without nickname', () => {
    expect(
      formatMemberListName({ first_name: 'jane', last_name: 'smith' })
    ).toBe('jane S.')
  })

  it('uses first name only when last missing', () => {
    expect(formatMemberListName({ first_name: 'Madonna' })).toBe('Madonna')
  })

  it('falls back to legacy display_name', () => {
    expect(formatMemberListName({ display_name: 'Legacy User' })).toBe('Legacy User')
  })

  it('falls back to email then userId', () => {
    expect(
      formatMemberListName({}, { email: 'a@b.co' })
    ).toBe('a@b.co')
    expect(
      formatMemberListName({}, { userId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee' })
    ).toBe('aaaaaaaa…')
  })
})

describe('profileDisplayNameForDb', () => {
  it('returns null when nothing to derive', () => {
    expect(profileDisplayNameForDb({})).toBeNull()
  })

  it('matches list label for structured names', () => {
    expect(
      profileDisplayNameForDb({ first_name: 'Jane', last_name: 'Smith' })
    ).toBe('Jane S.')
  })
})
