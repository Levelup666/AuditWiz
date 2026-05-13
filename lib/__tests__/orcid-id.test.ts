import { describe, expect, it } from 'vitest'
import { extractOrcidFromSupabaseIdentity, normalizeOrcidId } from '@/lib/auth/orcid-id'

describe('normalizeOrcidId', () => {
  it('normalizes dashed and undashed valid iDs', () => {
    expect(normalizeOrcidId('0000-0001-2345-6789')).toBe('0000-0001-2345-6789')
    expect(normalizeOrcidId('0000000123456789')).toBe('0000-0001-2345-6789')
    expect(normalizeOrcidId('0000-0002-1825-0097')).toBe('0000-0002-1825-0097')
  })

  it('accepts trailing X checksum', () => {
    expect(normalizeOrcidId('0000-0001-2345-678X')).toBe('0000-0001-2345-678X')
  })

  it('returns empty for invalid input', () => {
    expect(normalizeOrcidId('')).toBe('')
    expect(normalizeOrcidId('not-an-orcid')).toBe('')
    expect(normalizeOrcidId('0000-0001-2345-678')).toBe('')
  })
})

describe('extractOrcidFromSupabaseIdentity', () => {
  it('reads from OIDC sub URL', () => {
    expect(
      extractOrcidFromSupabaseIdentity({
        identity_id: 'irrelevant',
        identity_data: { sub: 'https://orcid.org/0000-0001-2345-6789' },
      })
    ).toBe('0000-0001-2345-6789')
  })

  it('reads from identity_id when formatted', () => {
    expect(
      extractOrcidFromSupabaseIdentity({
        identity_id: '0000-0002-1825-0097',
        identity_data: {},
      })
    ).toBe('0000-0002-1825-0097')
  })
})
