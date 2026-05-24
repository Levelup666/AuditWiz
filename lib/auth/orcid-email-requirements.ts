import { userHasUsableAuthEmail } from '@/lib/auth/orcid-email'
import {
  isOrcidPrimaryAccount,
  isOrcidProvider,
  userSignedInViaOrcid,
} from '@/lib/auth/is-orcid-auth'

/** User signed in with ORCID (or ORCID-primary) but has no usable auth email yet. */
export function userNeedsOrcidEmailCapture(
  user: {
    email?: string | null
    identities?: { provider: string }[] | null
    app_metadata?: Record<string, unknown> | null
  },
  profile: {
    orcid_id?: string | null
    orcid_verified?: boolean | null
    orcid_email_locked?: boolean | null
  } | null
): boolean {
  if (!isOrcidPrimaryAccount(user, profile)) return false

  const hasOrcidLink =
    Boolean(profile?.orcid_id) ||
    Boolean(user.identities?.some((i) => isOrcidProvider(i.provider))) ||
    userSignedInViaOrcid(user)

  if (!hasOrcidLink) return false

  return !userHasUsableAuthEmail(user.email)
}

/** Show editable contact email field (not read-only locked state). */
export function userNeedsOrcidEmailInput(
  user: {
    email?: string | null
    identities?: { provider: string }[] | null
    app_metadata?: Record<string, unknown> | null
  },
  profile: {
    orcid_id?: string | null
    orcid_verified?: boolean | null
    orcid_email_locked?: boolean | null
  } | null,
  options?: { forceRequired?: boolean }
): boolean {
  if (options?.forceRequired) return true
  if (userNeedsOrcidEmailCapture(user, profile)) return true
  if (
    isOrcidPrimaryAccount(user, profile) &&
    profile?.orcid_email_locked &&
    !userHasUsableAuthEmail(user.email)
  ) {
    return true
  }
  return false
}
