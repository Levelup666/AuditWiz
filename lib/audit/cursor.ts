import type { AuditEventsCursor } from '@/lib/supabase/audit'

export function encodeAuditEventsCursor(c: AuditEventsCursor): string {
  return Buffer.from(JSON.stringify(c), 'utf8').toString('base64url')
}

export function decodeAuditEventsCursor(s: string | null): AuditEventsCursor | null {
  if (!s?.trim()) return null
  try {
    const raw = Buffer.from(s, 'base64url').toString('utf8')
    const j = JSON.parse(raw) as unknown
    if (
      j &&
      typeof j === 'object' &&
      'timestamp' in j &&
      'id' in j &&
      typeof (j as AuditEventsCursor).timestamp === 'string' &&
      typeof (j as AuditEventsCursor).id === 'string'
    ) {
      return { timestamp: (j as AuditEventsCursor).timestamp, id: (j as AuditEventsCursor).id }
    }
  } catch {
    /* ignore */
  }
  return null
}
