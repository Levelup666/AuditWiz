/** Minimal shape of `User.identities[]` from Supabase Auth (OIDC / OAuth). */
export type OrcidAuthIdentityShape = {
  identity_id: string
  identity_data?: Record<string, unknown> | null
}

// ORCID iD format: 16 base digits, last may be X; display 0000-0000-0000-000X
export function normalizeOrcidId(raw: string): string {
  const digits = raw.replace(/-/g, '').trim().toUpperCase()
  if (digits.length !== 16) return ''
  const valid = /^\d{15}[\dX]$/.test(digits)
  if (!valid) return ''
  return `${digits.slice(0, 4)}-${digits.slice(4, 8)}-${digits.slice(8, 12)}-${digits.slice(12, 16)}`
}

/**
 * Pull a canonical ORCID iD from a Supabase Auth identity row (OIDC `sub`, identity_id, etc.).
 */
export function extractOrcidFromSupabaseIdentity(identity: OrcidAuthIdentityShape): string | null {
  const candidates: string[] = []
  if (typeof identity.identity_id === 'string' && identity.identity_id.trim()) {
    candidates.push(identity.identity_id.trim())
  }
  const data = identity.identity_data
  if (data && typeof data === 'object') {
    const sub = (data as Record<string, unknown>).sub
    if (typeof sub === 'string' && sub.trim()) candidates.push(sub.trim())
    const oid = (data as Record<string, unknown>).orcid
    if (typeof oid === 'string' && oid.trim()) candidates.push(oid.trim())
  }

  const urlPattern = /(\d{4}-\d{4}-\d{4}-\d{3}[\dX])/i
  for (const c of candidates) {
    const fromUrl = c.match(urlPattern)
    if (fromUrl) {
      const n = normalizeOrcidId(fromUrl[1])
      if (n) return n
    }
    const n = normalizeOrcidId(c)
    if (n) return n
  }
  return null
}
