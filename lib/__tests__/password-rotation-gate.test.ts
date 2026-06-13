import { describe, expect, it } from 'vitest'
import { passwordGatePathnameForReason } from '@/lib/auth/password-rotation-gate'

describe('passwordGatePathnameForReason', () => {
  it('routes first-time users to account setup for rotation', () => {
    expect(
      passwordGatePathnameForReason('rotation_required', { account_setup_completed_at: null })
    ).toBe('/account/setup')
  })

  it('routes completed users to security for rotation gaps', () => {
    expect(
      passwordGatePathnameForReason('rotation_required', {
        account_setup_completed_at: '2026-01-01T00:00:00Z',
      })
    ).toBe('/account/security')
  })

  it('always routes expired passwords to security', () => {
    expect(
      passwordGatePathnameForReason('password_expired', { account_setup_completed_at: null })
    ).toBe('/account/security')
  })
})
