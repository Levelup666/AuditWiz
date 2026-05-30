import { describe, expect, it } from 'vitest'
import {
  isPasswordRotationExpired,
  needsPasswordRotationSetup,
  parseRotationDays,
  userSubjectToPasswordPolicy,
  validatePassword,
} from '@/lib/auth/password-policy'

describe('validatePassword', () => {
  it('rejects short passwords', () => {
    const r = validatePassword('short1!')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errors[0]).toMatch(/12/)
  })

  it('rejects trivial passwords', () => {
    const r = validatePassword('passwordpassword')
    expect(r.ok).toBe(false)
  })

  it('rejects password containing email local part', () => {
    const r = validatePassword('jane.doe@longpassphrase!!', { email: 'jane.doe@example.com' })
    expect(r.ok).toBe(false)
  })

  it('accepts a strong passphrase', () => {
    const r = validatePassword('correct-horse-battery-staple-2026', { email: 'other@example.com' })
    expect(r.ok).toBe(true)
  })
})

describe('parseRotationDays', () => {
  it('parses valid intervals', () => {
    expect(parseRotationDays('30')).toBe(30)
    expect(parseRotationDays(60)).toBe(60)
    expect(parseRotationDays('90')).toBe(90)
  })

  it('rejects invalid intervals', () => {
    expect(parseRotationDays('45')).toBe(null)
    expect(parseRotationDays('')).toBe(null)
  })
})

describe('userSubjectToPasswordPolicy', () => {
  it('exempts legacy users', () => {
    expect(
      userSubjectToPasswordPolicy(
        { identities: [{ provider: 'email' }] },
        { password_policy_legacy: true }
      )
    ).toBe(false)
  })

  it('exempts ORCID-primary accounts', () => {
    expect(
      userSubjectToPasswordPolicy(
        {
          identities: [{ provider: 'orcid' }],
          app_metadata: { provider: 'orcid' },
        },
        { password_policy_legacy: false }
      )
    ).toBe(false)
  })

  it('applies to email/password non-legacy users', () => {
    expect(
      userSubjectToPasswordPolicy(
        { identities: [{ provider: 'email' }] },
        { password_policy_legacy: false }
      )
    ).toBe(true)
  })
})

describe('isPasswordRotationExpired', () => {
  it('returns false when rotation not configured', () => {
    expect(
      isPasswordRotationExpired({
        passwordLastChangedAt: '2020-01-01T00:00:00Z',
        rotationDays: null,
        now: new Date('2026-01-01'),
      })
    ).toBe(false)
  })

  it('returns true after interval elapses', () => {
    expect(
      isPasswordRotationExpired({
        passwordLastChangedAt: '2026-01-01T00:00:00Z',
        rotationDays: 30,
        now: new Date('2026-02-15'),
      })
    ).toBe(true)
  })

  it('returns false before interval elapses', () => {
    expect(
      isPasswordRotationExpired({
        passwordLastChangedAt: '2026-01-01T00:00:00Z',
        rotationDays: 90,
        now: new Date('2026-02-01'),
      })
    ).toBe(false)
  })
})

describe('needsPasswordRotationSetup', () => {
  it('requires setup when subject and no interval', () => {
    expect(
      needsPasswordRotationSetup(
        { password_policy_legacy: false, password_rotation_days: null },
        { identities: [{ provider: 'email' }] }
      )
    ).toBe(true)
  })
})
