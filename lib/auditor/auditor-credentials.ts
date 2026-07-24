import { getAuditorReferenceIdPolicy } from '@/lib/auditor/auditor-credential-policy'

export const AUDITOR_ATTESTATION_STATEMENT =
  'I attest that I am an authorized representative of the named audit organization for this engagement, that the information I provided is accurate, and that I will use read-only access solely for the stated audit purpose.'

export type AuditorCredentialsInput = {
  organizationName: string
  title?: string
  referenceId?: string
  attested: boolean
}

export type ValidatedAuditorCredentials = {
  organizationName: string
  title: string | null
  referenceId: string | null
  attested: true
}

export type AuditorCredentialsValidationResult =
  | { ok: true; credentials: ValidatedAuditorCredentials }
  | { ok: false; error: string }

function compileFormat(pattern: string): RegExp | null {
  try {
    return new RegExp(`^(?:${pattern})$`)
  } catch {
    return null
  }
}

/**
 * Validates auditor identity fields collected at engagement accept.
 * Institution metadata may require / format-check the reference ID.
 */
export function validateAuditorCredentials(
  input: AuditorCredentialsInput,
  institutionMetadata?: unknown
): AuditorCredentialsValidationResult {
  const org = input.organizationName?.trim() ?? ''
  if (org.length < 2) {
    return { ok: false, error: 'Enter the audit organization or firm you represent.' }
  }
  if (org.length > 200) {
    return { ok: false, error: 'Organization name is too long.' }
  }

  const titleRaw = input.title?.trim() ?? ''
  if (titleRaw.length > 120) {
    return { ok: false, error: 'Title is too long.' }
  }

  const refRaw = input.referenceId?.trim() ?? ''
  if (refRaw.length > 120) {
    return { ok: false, error: 'Reference ID is too long.' }
  }

  const policy = getAuditorReferenceIdPolicy(institutionMetadata)
  if (policy.required && !refRaw) {
    return {
      ok: false,
      error: `Enter your ${policy.label.toLowerCase()}.`,
    }
  }

  if (refRaw && policy.format) {
    const re = compileFormat(policy.format)
    if (!re) {
      return {
        ok: false,
        error:
          'This institution’s reference ID format setting is invalid. Ask an admin to fix institution settings.',
      }
    }
    if (!re.test(refRaw)) {
      return {
        ok: false,
        error: `${policy.label} does not match the required format.`,
      }
    }
  }

  if (!input.attested) {
    return {
      ok: false,
      error: 'Confirm the attestation before accepting this audit engagement.',
    }
  }

  return {
    ok: true,
    credentials: {
      organizationName: org,
      title: titleRaw.length > 0 ? titleRaw : null,
      referenceId: refRaw.length > 0 ? refRaw : null,
      attested: true,
    },
  }
}
