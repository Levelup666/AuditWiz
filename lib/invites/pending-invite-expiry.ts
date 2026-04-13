/**
 * Pending study/institution invites use `expires_at` on invite rows (token + in-app accept).
 * Auth confirmation / magic-link TTL is controlled in Supabase Dashboard, not here.
 *
 * Set `INVITE_PENDING_EXPIRY_DAYS` (1–365, default 7) to tune how long `/invite/{token}` and
 * in-app pending invites remain valid. Expired rows are excluded from duplicate checks so a new
 * invite can be sent.
 */
const DEFAULT_DAYS = 7
const MIN_DAYS = 1
const MAX_DAYS = 365

export function getPendingInviteExpiryDays(): number {
  const raw = process.env.INVITE_PENDING_EXPIRY_DAYS
  if (raw === undefined || raw === '') {
    return DEFAULT_DAYS
  }
  const n = Number(raw)
  if (!Number.isFinite(n)) {
    return DEFAULT_DAYS
  }
  return Math.min(MAX_DAYS, Math.max(MIN_DAYS, Math.floor(n)))
}

/** `from` is usually `new Date()` at invite creation time (local calendar days, same as prior hard-coded +7). */
export function getPendingInviteExpiresAt(from: Date = new Date()): Date {
  const d = new Date(from.getTime())
  d.setDate(d.getDate() + getPendingInviteExpiryDays())
  return d
}

/** Short line for emails (UTC + local hint). */
export function formatPendingInviteExpiryForEmail(expiresAtIso: string): string {
  try {
    const d = new Date(expiresAtIso)
    if (Number.isNaN(d.getTime())) return ''
    const utc = d.toISOString().replace('T', ' ').slice(0, 16) + ' UTC'
    const local = d.toLocaleString(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    })
    return `This invitation expires after ${local} (your local time) — ${utc}. After that, ask for a new invite.`
  } catch {
    return ''
  }
}
