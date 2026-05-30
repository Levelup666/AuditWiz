import { zxcvbn, zxcvbnOptions } from '@zxcvbn-ts/core'
import * as zxcvbnCommonPackage from '@zxcvbn-ts/language-common'
import * as zxcvbnEnPackage from '@zxcvbn-ts/language-en'
import { hasEmailPasswordIdentity, isOrcidPrimaryAccount } from '@/lib/auth/is-orcid-auth'

export const PASSWORD_MIN_LENGTH = 12
export const PASSWORD_MAX_LENGTH = 128
export const PASSWORD_MIN_ZXCVBN_SCORE = 3

export const ROTATION_OPTIONS = [30, 60, 90] as const
export type PasswordRotationDays = (typeof ROTATION_OPTIONS)[number]

const TRIVIAL_PASSWORDS = new Set([
  'password',
  'password123',
  'password1234',
  'qwertyuiop',
  'letmein',
  'welcome',
  'admin',
  'changeme',
])

let zxcvbnInitialized = false

function ensureZxcvbn() {
  if (zxcvbnInitialized) return
  const options = {
    translations: zxcvbnEnPackage.translations,
    graphs: zxcvbnCommonPackage.adjacencyGraphs,
    dictionary: {
      ...zxcvbnCommonPackage.dictionary,
      ...zxcvbnEnPackage.dictionary,
    },
  }
  zxcvbnOptions.setOptions(options)
  zxcvbnInitialized = true
}

export type PasswordValidationContext = {
  email?: string | null
}

export type PasswordValidationResult =
  | { ok: true }
  | { ok: false; errors: string[] }

export function getPasswordStrengthLabel(password: string): string | null {
  if (!password) return null
  ensureZxcvbn()
  const result = zxcvbn(password)
  const labels = ['Very weak', 'Weak', 'Fair', 'Strong', 'Very strong']
  return labels[result.score] ?? null
}

export function validatePassword(
  password: string,
  context?: PasswordValidationContext
): PasswordValidationResult {
  const errors: string[] = []

  if (password.length < PASSWORD_MIN_LENGTH) {
    errors.push(`Use at least ${PASSWORD_MIN_LENGTH} characters.`)
  }
  if (password.length > PASSWORD_MAX_LENGTH) {
    errors.push(`Use at most ${PASSWORD_MAX_LENGTH} characters.`)
  }

  const lower = password.toLowerCase()
  if (TRIVIAL_PASSWORDS.has(lower)) {
    errors.push('Choose a less common password.')
  }

  const email = context?.email?.trim().toLowerCase()
  if (email) {
    const local = email.split('@')[0]
    if (local.length >= 3 && lower.includes(local)) {
      errors.push('Do not include your email address in your password.')
    }
  }

  if (password.length >= PASSWORD_MIN_LENGTH) {
    ensureZxcvbn()
    const userInputs: string[] = []
    if (email) userInputs.push(email, email.split('@')[0] ?? '')
    const result = zxcvbn(password, userInputs.filter(Boolean))
    if (result.score < PASSWORD_MIN_ZXCVBN_SCORE) {
      const hint = result.feedback.warning || result.feedback.suggestions[0]
      errors.push(
        hint
          ? `Password is too weak: ${hint}`
          : 'Password is too weak. Try a longer passphrase with uncommon words.'
      )
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors }
  }
  return { ok: true }
}

export function parseRotationDays(value: unknown): PasswordRotationDays | null {
  const n = typeof value === 'string' ? parseInt(value, 10) : typeof value === 'number' ? value : NaN
  if (n === 30 || n === 60 || n === 90) return n
  return null
}

export type ProfilePasswordPolicyFields = {
  password_policy_legacy?: boolean | null
  password_rotation_days?: number | null
  password_last_changed_at?: string | null
  orcid_email_locked?: boolean | null
}

export function userSubjectToPasswordPolicy(
  user: {
    identities?: { provider: string }[] | null
    app_metadata?: Record<string, unknown> | null
  },
  profile?: ProfilePasswordPolicyFields | null
): boolean {
  if (profile?.password_policy_legacy) return false
  if (isOrcidPrimaryAccount(user, profile)) return false
  if (!hasEmailPasswordIdentity(user)) return false
  return true
}

export function isPasswordRotationExpired(params: {
  passwordLastChangedAt: string | null | undefined
  rotationDays: number | null | undefined
  now?: Date
}): boolean {
  const { passwordLastChangedAt, rotationDays } = params
  if (!rotationDays || !passwordLastChangedAt) return false
  const changed = new Date(passwordLastChangedAt)
  if (Number.isNaN(changed.getTime())) return false
  const now = params.now ?? new Date()
  const expires = new Date(changed.getTime() + rotationDays * 24 * 60 * 60 * 1000)
  return now >= expires
}

export function needsPasswordRotationSetup(
  profile: ProfilePasswordPolicyFields | null | undefined,
  user: Parameters<typeof userSubjectToPasswordPolicy>[0]
): boolean {
  if (!userSubjectToPasswordPolicy(user, profile)) return false
  return profile?.password_rotation_days == null
}
