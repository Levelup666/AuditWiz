/**
 * Institution policy for auditor credential / reference ID format.
 * Stored in institutions.metadata.
 */

export const AUDITOR_REFERENCE_ID_FORMAT_KEY = 'auditor_reference_id_format' as const
export const AUDITOR_REFERENCE_ID_LABEL_KEY = 'auditor_reference_id_label' as const
export const AUDITOR_REFERENCE_ID_REQUIRED_KEY = 'auditor_reference_id_required' as const

export type AuditorReferenceIdPolicy = {
  /** RE2-safe JS RegExp source; empty = no format check */
  format: string | null
  /** UI label, e.g. "Firm engagement ID" */
  label: string
  /** When true, reference ID is required on accept */
  required: boolean
}

const DEFAULT_LABEL = 'Auditor / engagement reference ID'

export function getAuditorReferenceIdPolicy(metadata: unknown): AuditorReferenceIdPolicy {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return { format: null, label: DEFAULT_LABEL, required: false }
  }
  const m = metadata as Record<string, unknown>
  const formatRaw = m[AUDITOR_REFERENCE_ID_FORMAT_KEY]
  const format =
    typeof formatRaw === 'string' && formatRaw.trim().length > 0 ? formatRaw.trim() : null
  const labelRaw = m[AUDITOR_REFERENCE_ID_LABEL_KEY]
  const label =
    typeof labelRaw === 'string' && labelRaw.trim().length > 0
      ? labelRaw.trim().slice(0, 80)
      : DEFAULT_LABEL
  const req = m[AUDITOR_REFERENCE_ID_REQUIRED_KEY]
  const required = req === true || req === 'true'
  return { format, label, required }
}

export function parseAuditorReferenceIdFormatFromForm(
  value: string | null | undefined
): string | null {
  const t = value?.trim() ?? ''
  return t.length > 0 ? t.slice(0, 200) : null
}

export function parseAuditorReferenceIdLabelFromForm(
  value: string | null | undefined
): string {
  const t = value?.trim() ?? ''
  return t.length > 0 ? t.slice(0, 80) : DEFAULT_LABEL
}

export function parseAuditorReferenceIdRequiredFromForm(
  value: string | null | undefined
): boolean {
  return value === 'true' || value === 'on' || value === '1'
}
