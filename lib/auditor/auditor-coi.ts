/**
 * Conflict-of-interest declaration collected at audit engagement accept.
 * Advisory integrity control — not a regulatory compliance claim.
 */

export const AUDITOR_COI_STATEMENT =
  'I declare that I have considered conflicts of interest relevant to this engagement. If I indicated a potential conflict, I have disclosed it accurately. I will notify the granting institution if a new conflict arises during the engagement window.'

export type AuditorCoiInput = {
  declared: boolean
  hasConflict: boolean
  disclosure?: string
}

export type ValidatedAuditorCoi = {
  declared: true
  hasConflict: boolean
  disclosure: string | null
}

export type AuditorCoiValidationResult =
  | { ok: true; coi: ValidatedAuditorCoi }
  | { ok: false; error: string }

/**
 * Validates COI declaration at accept. Disclosure is required when hasConflict is true.
 */
export function validateAuditorCoi(input: AuditorCoiInput): AuditorCoiValidationResult {
  if (!input.declared) {
    return {
      ok: false,
      error: 'Confirm the conflict-of-interest declaration before accepting.',
    }
  }

  const disclosureRaw = input.disclosure?.trim() ?? ''
  if (disclosureRaw.length > 2000) {
    return { ok: false, error: 'Conflict disclosure is too long.' }
  }

  if (input.hasConflict && disclosureRaw.length < 8) {
    return {
      ok: false,
      error: 'Describe the potential conflict (at least a brief disclosure).',
    }
  }

  if (!input.hasConflict && disclosureRaw.length > 0) {
    return {
      ok: false,
      error: 'Clear the disclosure text unless you are declaring a potential conflict.',
    }
  }

  return {
    ok: true,
    coi: {
      declared: true,
      hasConflict: Boolean(input.hasConflict),
      disclosure: input.hasConflict ? disclosureRaw : null,
    },
  }
}
