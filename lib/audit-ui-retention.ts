/**
 * UI/export retention for audit_events: append-only rows are never deleted;
 * queries exclude events older than this window. Override with AUDIT_UI_RETENTION_DAYS.
 */

const DEFAULT_RETENTION_DAYS = 365
const MIN_DAYS = 1
const MAX_DAYS = 365 * 10

function parseRetentionDays(): number {
  const raw = process.env.AUDIT_UI_RETENTION_DAYS
  if (raw === undefined || raw === '') return DEFAULT_RETENTION_DAYS
  const n = Number.parseInt(raw, 10)
  if (!Number.isFinite(n) || n < MIN_DAYS) return DEFAULT_RETENTION_DAYS
  return Math.min(n, MAX_DAYS)
}

/** ISO timestamp: events with timestamp < this are hidden from app UI and member export. */
export function getAuditUiRetentionCutoffIso(): string {
  const days = parseRetentionDays()
  const d = new Date()
  d.setUTCDate(d.getUTCDate() - days)
  return d.toISOString()
}

export function getAuditUiRetentionDays(): number {
  return parseRetentionDays()
}
