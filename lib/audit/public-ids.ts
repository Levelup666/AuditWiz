/**
 * Client-facing study and audit event identifiers.
 * Keep formatters in lockstep with supabase/migrations/20260919231805_study_scoped_audit_event_ids.sql
 */

const SEQUENTIAL_EVENT_ID = /^(STD-\d+-EVT-\d+|SYS-EVT-\d+)$/

export function formatStudyPublicCode(n: number): string {
  if (!Number.isInteger(n) || n < 1) {
    throw new Error('study sequence must be a positive integer')
  }
  return n < 10000 ? `STD-${String(n).padStart(4, '0')}` : `STD-${n}`
}

export function formatAuditEventPublicId(
  studyCode: string | null,
  n: number
): string {
  if (!Number.isInteger(n) || n < 1) {
    throw new Error('event sequence must be a positive integer')
  }
  const seq = n < 100000 ? String(n).padStart(5, '0') : String(n)
  const code = studyCode?.trim()
  return code ? `${code}-EVT-${seq}` : `SYS-EVT-${seq}`
}

export function isSequentialAuditEventId(eventId: string): boolean {
  return SEQUENTIAL_EVENT_ID.test(eventId)
}

/** Full sequential IDs; truncate legacy hex event_id for display only. */
export function displayAuditEventId(eventId: string | null | undefined): string {
  if (!eventId) return '—'
  if (isSequentialAuditEventId(eventId)) return eventId
  return eventId.length > 16 ? `${eventId.slice(0, 16)}…` : eventId
}

export function auditEventTargetLabel(event: {
  target_entity_type?: unknown
  target_entity_id?: unknown
  metadata?: unknown
}): string | null {
  const meta = (event.metadata ?? {}) as Record<string, unknown>
  const type = String(event.target_entity_type ?? '')

  if (type === 'record') {
    const recordNumber =
      typeof meta.record_number === 'string' ? meta.record_number.trim() : ''
    if (recordNumber) {
      const version = meta.version
      const versionLabel =
        typeof version === 'number'
          ? ` v${version}`
          : typeof version === 'string' && version.trim()
            ? ` v${version.trim()}`
            : ''
      return `${recordNumber}${versionLabel}`
    }
  }

  if (typeof meta.file_name === 'string' && meta.file_name.trim()) {
    return meta.file_name.trim()
  }
  if (typeof meta.title === 'string' && meta.title.trim()) {
    return meta.title.trim()
  }

  const id = event.target_entity_id
  if (typeof id === 'string' && id.length > 0) {
    return `${id.slice(0, 8)}…`
  }
  return null
}
