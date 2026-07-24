import { describe, expect, it } from 'vitest'
import {
  AUDITOR_ATTESTATION_STATEMENT,
  validateAuditorCredentials,
} from '@/lib/auditor/auditor-credentials'
import { getAuditorReferenceIdPolicy } from '@/lib/auditor/auditor-credential-policy'

describe('validateAuditorCredentials', () => {
  it('requires organization name and attestation', () => {
    expect(
      validateAuditorCredentials({ organizationName: '', attested: true }).ok
    ).toBe(false)
    expect(
      validateAuditorCredentials({ organizationName: 'Acme Audit', attested: false }).ok
    ).toBe(false)
  })

  it('accepts valid minimal credentials', () => {
    const result = validateAuditorCredentials({
      organizationName: 'Acme Audit LLP',
      attested: true,
    })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.credentials.organizationName).toBe('Acme Audit LLP')
      expect(result.credentials.title).toBeNull()
      expect(result.credentials.referenceId).toBeNull()
    }
  })

  it('enforces required reference ID from institution policy', () => {
    const result = validateAuditorCredentials(
      { organizationName: 'Acme', attested: true },
      { auditor_reference_id_required: true, auditor_reference_id_label: 'Firm ID' }
    )
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.toLowerCase()).toContain('firm id')
  })

  it('validates reference ID format', () => {
    const meta = {
      auditor_reference_id_format: 'ENG-\\d{4}',
      auditor_reference_id_required: true,
    }
    expect(
      validateAuditorCredentials(
        { organizationName: 'Acme', referenceId: 'bad', attested: true },
        meta
      ).ok
    ).toBe(false)
    const ok = validateAuditorCredentials(
      { organizationName: 'Acme', referenceId: 'ENG-2026', attested: true },
      meta
    )
    expect(ok.ok).toBe(true)
  })

  it('exports a stable attestation statement', () => {
    expect(AUDITOR_ATTESTATION_STATEMENT.length).toBeGreaterThan(40)
  })
})

describe('getAuditorReferenceIdPolicy', () => {
  it('defaults to optional with no format', () => {
    expect(getAuditorReferenceIdPolicy(null)).toEqual({
      format: null,
      label: 'Auditor / engagement reference ID',
      required: false,
    })
  })
})
