import { normalizeContactEmail } from '@/lib/auth/orcid-email'
import { loadAllowedOrcidEmails } from '@/lib/auth/orcid-email-resolve'

export type OrcidEmailValidationMode = 'orcid_record' | 'attested'

export type ValidateOrcidContactEmailResult =
  | { ok: true; mode: OrcidEmailValidationMode }
  | { ok: false; error: string; requiresAttestation?: boolean }

/**
 * Validates manual ORCID contact email.
 * - When ORCID exposes emails (public/member/token): must match the allowed list.
 * - When none are discoverable (typical Public API + private email): allows attested manual entry.
 */
export async function validateOrcidContactEmail(params: {
  orcidId: string
  emailRaw: string
  identityData?: Record<string, unknown> | null
  providerAccessToken?: string | null
  /** User confirmed the address is on their ORCID record (required when API returns no emails). */
  attested?: boolean
}): Promise<ValidateOrcidContactEmailResult> {
  const email = normalizeContactEmail(params.emailRaw)
  if (!email) {
    return { ok: false, error: 'Enter a valid email address.' }
  }

  const { emails: allowed } = await loadAllowedOrcidEmails({
    orcidId: params.orcidId,
    identityData: params.identityData,
    providerAccessToken: params.providerAccessToken,
  })

  if (allowed.length === 0) {
    if (!params.attested) {
      return {
        ok: false,
        error:
          'Confirm that this is the same email address on your ORCID account before continuing.',
        requiresAttestation: true,
      }
    }
    return { ok: true, mode: 'attested' }
  }

  if (!allowed.includes(email)) {
    return {
      ok: false,
      error:
        'That email is not listed on your ORCID record. Pick an address from the suggestions, or use the email shown on ORCID.org.',
    }
  }

  return { ok: true, mode: 'orcid_record' }
}

/** True when Public/member APIs returned no emails — manual entry uses attestation. */
export function orcidEmailRequiresAttestation(discoverableEmails: string[]): boolean {
  return discoverableEmails.length === 0
}
