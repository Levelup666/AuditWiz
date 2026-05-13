import { describe, expect, it } from 'vitest'
import {
  formatMemberListName,
  memberDisplayHintsFromAuthMetadata,
  profileDisplayNameForDb,
} from '@/lib/profile/member-display-name'
import { resolveMemberDisplayName } from '@/lib/profile/resolve-member-display'

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

describe('memberDisplayHintsFromAuthMetadata', () => {
  it('maps first_name / last_name from metadata', () => {
    expect(memberDisplayHintsFromAuthMetadata({ first_name: 'Ada', last_name: 'Lovelace' })).toMatchObject({
      first_name: 'Ada',
      last_name: 'Lovelace',
    })
  })

  it('maps given_name / family_name', () => {
    expect(
      memberDisplayHintsFromAuthMetadata({ given_name: 'Grace', family_name: 'Hopper' })
    ).toMatchObject({
      first_name: 'Grace',
      last_name: 'Hopper',
    })
  })

  it('uses full_name as display_name when structured names missing', () => {
    expect(memberDisplayHintsFromAuthMetadata({ full_name: 'Marie Curie' })).toMatchObject({
      display_name: 'Marie Curie',
    })
  })
})

describe('resolveMemberDisplayName', () => {
  it('uses Auth metadata when profile is empty', () => {
    expect(
      resolveMemberDisplayName(
        null,
        { first_name: 'Ada', last_name: 'Lovelace' },
        'ada@example.com'
      )
    ).toBe('Ada L.')
  })

  it('prefers profile over conflicting metadata', () => {
    expect(
      resolveMemberDisplayName(
        { first_name: 'Profile', last_name: 'User', nickname: null, display_name: null },
        { first_name: 'Meta', last_name: 'Wrong' },
        'p@example.com'
      )
    ).toBe('Profile U.')
  })

  it('falls back to email when no names', () => {
    expect(resolveMemberDisplayName(null, {}, 'only@email.com')).toBe('only@email.com')
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
