/** Must match the inline script in `app/layout.tsx` (beforeInteractive). */
export const AUTH_HASH_CAPTURE_KEY = 'auditwiz_auth_hash_capture'

const MAX_AGE_MS = 5 * 60 * 1000

export type EarlyHashCapture = {
  type: string | null
  hasImplicit: boolean
  ts: number
}

export function readEarlyHashCapture(): EarlyHashCapture | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = sessionStorage.getItem(AUTH_HASH_CAPTURE_KEY)
    if (!raw) return null
    const o = JSON.parse(raw) as EarlyHashCapture
    if (!o || typeof o.ts !== 'number') return null
    if (Date.now() - o.ts > MAX_AGE_MS) {
      sessionStorage.removeItem(AUTH_HASH_CAPTURE_KEY)
      return null
    }
    return o
  } catch {
    return null
  }
}

export function consumeEarlyHashCapture() {
  try {
    sessionStorage.removeItem(AUTH_HASH_CAPTURE_KEY)
  } catch {
    /* ignore */
  }
}
