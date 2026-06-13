import { describe, expect, it } from 'vitest'
import { parseMemberRemovalNote } from '@/lib/member-removal-note'

describe('parseMemberRemovalNote', () => {
  it('rejects empty notes', () => {
    expect(parseMemberRemovalNote('').ok).toBe(false)
    expect(parseMemberRemovalNote('   ').ok).toBe(false)
  })

  it('rejects notes that are too short', () => {
    expect(parseMemberRemovalNote('too short').ok).toBe(false)
  })

  it('accepts valid notes', () => {
    const r = parseMemberRemovalNote('Member completed their contribution and requested removal.')
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.note).toContain('completed their contribution')
    }
  })
})
