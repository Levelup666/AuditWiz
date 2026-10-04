import { describe, expect, it } from 'vitest'
import {
  auditEventTargetLabel,
  displayAuditEventId,
  formatAuditEventPublicId,
  formatStudyPublicCode,
  isSequentialAuditEventId,
} from '@/lib/audit/public-ids'

describe('formatStudyPublicCode', () => {
  it('zero-pads to four digits', () => {
    expect(formatStudyPublicCode(1)).toBe('STD-0001')
    expect(formatStudyPublicCode(42)).toBe('STD-0042')
    expect(formatStudyPublicCode(9999)).toBe('STD-9999')
  })

  it('does not truncate values at 10000+', () => {
    expect(formatStudyPublicCode(10000)).toBe('STD-10000')
  })
})

describe('formatAuditEventPublicId', () => {
  it('scopes the sequence to the study code', () => {
    expect(formatAuditEventPublicId('STD-0042', 1)).toBe('STD-0042-EVT-00001')
    expect(formatAuditEventPublicId('STD-0042', 87)).toBe('STD-0042-EVT-00087')
  })

  it('uses SYS prefix when there is no study', () => {
    expect(formatAuditEventPublicId(null, 12)).toBe('SYS-EVT-00012')
    expect(formatAuditEventPublicId('  ', 1)).toBe('SYS-EVT-00001')
  })

  it('does not truncate sequences at 100000+', () => {
    expect(formatAuditEventPublicId('STD-0001', 100000)).toBe(
      'STD-0001-EVT-100000'
    )
  })
})

describe('displayAuditEventId', () => {
  it('shows sequential IDs in full', () => {
    expect(displayAuditEventId('STD-0042-EVT-00001')).toBe('STD-0042-EVT-00001')
    expect(isSequentialAuditEventId('SYS-EVT-00012')).toBe(true)
  })

  it('truncates legacy hex event IDs', () => {
    const legacy =
      'evt_61316232633364342d653566362d343738392d616263642d656631323334353637383930'
    expect(displayAuditEventId(legacy)).toBe('evt_613162326333…')
    expect(isSequentialAuditEventId(legacy)).toBe(false)
  })
})

describe('auditEventTargetLabel', () => {
  it('prefers record_number and version from metadata', () => {
    expect(
      auditEventTargetLabel({
        target_entity_type: 'record',
        target_entity_id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
        metadata: { record_number: 'CRF-014', version: 2 },
      })
    ).toBe('CRF-014 v2')
  })

  it('uses file name for documents', () => {
    expect(
      auditEventTargetLabel({
        target_entity_type: 'document',
        metadata: { file_name: 'consent.pdf' },
      })
    ).toBe('consent.pdf')
  })
})
