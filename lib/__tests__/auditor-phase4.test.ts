import { describe, expect, it } from 'vitest'
import { validateAuditorCoi, AUDITOR_COI_STATEMENT } from '@/lib/auditor/auditor-coi'
import {
  parseActiveContext,
  resolveActiveContext,
  shouldPresentAuditorShell,
} from '@/lib/auditor/active-context'
import { validateEngagementLetterFile } from '@/lib/auditor/attach-engagement-letter'

describe('validateAuditorCoi', () => {
  it('requires declaration', () => {
    expect(validateAuditorCoi({ declared: false, hasConflict: false }).ok).toBe(false)
  })

  it('accepts clear COI', () => {
    const result = validateAuditorCoi({ declared: true, hasConflict: false })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.coi.hasConflict).toBe(false)
      expect(result.coi.disclosure).toBeNull()
    }
  })

  it('requires disclosure when conflict flagged', () => {
    expect(
      validateAuditorCoi({ declared: true, hasConflict: true, disclosure: 'short' }).ok
    ).toBe(false)
    const ok = validateAuditorCoi({
      declared: true,
      hasConflict: true,
      disclosure: 'Spouse works in the study lab under review.',
    })
    expect(ok.ok).toBe(true)
  })

  it('exports a stable COI statement', () => {
    expect(AUDITOR_COI_STATEMENT.length).toBeGreaterThan(40)
  })
})

describe('active context', () => {
  it('parses cookie values', () => {
    expect(parseActiveContext('auditor')).toBe('auditor')
    expect(parseActiveContext('member')).toBe('member')
    expect(parseActiveContext('other')).toBeNull()
  })

  it('forces auditor for auditor-primary', () => {
    expect(
      resolveActiveContext({ auditorPrimary: true, dualRole: false, cookieValue: 'member' })
    ).toBe('auditor')
  })

  it('defaults dual-role to member', () => {
    expect(
      resolveActiveContext({ auditorPrimary: false, dualRole: true, cookieValue: null })
    ).toBe('member')
  })

  it('presents auditor shell for dual-role auditor context', () => {
    expect(
      shouldPresentAuditorShell({
        auditorPrimary: false,
        dualRole: true,
        activeContext: 'auditor',
      })
    ).toBe(true)
    expect(
      shouldPresentAuditorShell({
        auditorPrimary: false,
        dualRole: true,
        activeContext: 'member',
      })
    ).toBe(false)
  })
})

describe('validateEngagementLetterFile', () => {
  it('accepts PDF', () => {
    expect(
      validateEngagementLetterFile({
        name: 'scope.pdf',
        type: 'application/pdf',
        size: 1024,
      }).valid
    ).toBe(true)
  })

  it('rejects non-PDF', () => {
    expect(
      validateEngagementLetterFile({
        name: 'scope.docx',
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        size: 1024,
      }).valid
    ).toBe(false)
  })
})
