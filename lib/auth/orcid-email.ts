const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const ORCID_JSON_ACCEPT = 'application/vnd.orcid+json'

export function normalizeContactEmail(raw: string): string | null {
  const email = raw.trim().toLowerCase()
  if (!email || !EMAIL_RE.test(email)) return null
  return email
}

/** Pull email from Supabase Auth identity payload after ORCID OIDC. */
export function extractEmailFromOrcidIdentityData(
  identityData: Record<string, unknown> | null | undefined
): string | null {
  if (!identityData) return null
  const direct = identityData.email
  if (typeof direct === 'string') {
    const n = normalizeContactEmail(direct)
    if (n) return n
  }
  if (direct && typeof direct === 'object' && !Array.isArray(direct)) {
    const obj = direct as Record<string, unknown>
    const value = obj.value ?? obj.email
    if (typeof value === 'string') {
      const n = normalizeContactEmail(value)
      if (n) return n
    }
  }
  const preferred = identityData.preferred_username
  if (typeof preferred === 'string' && preferred.includes('@')) {
    return normalizeContactEmail(preferred)
  }
  return null
}

type OrcidEmailRow = {
  email?: string
  primary?: boolean
  visibility?: string
}

function emailsFromOrcidRows(rows: OrcidEmailRow[]): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  const primary = rows.find((r) => r.primary && typeof r.email === 'string')
  const ordered = primary ? [primary, ...rows.filter((r) => r !== primary)] : rows
  for (const row of ordered) {
    if (typeof row.email !== 'string') continue
    const n = normalizeContactEmail(row.email)
    if (n && !seen.has(n)) {
      seen.add(n)
      out.push(n)
    }
  }
  return out
}

async function fetchOrcidEmailRows(
  orcidId: string,
  baseUrl: string,
  headers: Record<string, string>
): Promise<OrcidEmailRow[] | null> {
  const url = `${baseUrl}/${encodeURIComponent(orcidId)}/email`
  try {
    const res = await fetch(url, { headers: { Accept: ORCID_JSON_ACCEPT, ...headers } })
    if (!res.ok) return null
    const rows = (await res.json()) as OrcidEmailRow[]
    return Array.isArray(rows) ? rows : null
  } catch {
    return null
  }
}

/** All public emails on an ORCID record. */
export async function fetchPublicOrcidEmails(orcidId: string): Promise<string[]> {
  const rows = await fetchOrcidEmailRows(orcidId, 'https://pub.orcid.org/v3.0', {})
  if (!rows?.length) return []
  return emailsFromOrcidRows(rows)
}

/** Public ORCID record — primary email if any public email exists. */
export async function fetchPublicOrcidPrimaryEmail(
  orcidId: string
): Promise<string | null> {
  const emails = await fetchPublicOrcidEmails(orcidId)
  return emails[0] ?? null
}

/** ORCID record emails using the user OAuth access token (member API host). */
export async function fetchOrcidEmailsWithAccessToken(
  orcidId: string,
  accessToken: string
): Promise<string[]> {
  const rows = await fetchOrcidEmailRows(orcidId, 'https://api.orcid.org/v3.0', {
    Authorization: `Bearer ${accessToken}`,
  })
  if (!rows?.length) return []
  return emailsFromOrcidRows(rows)
}

let memberTokenCache: { token: string; expiresAt: number } | null = null

async function getOrcidMemberClientCredentialsToken(): Promise<string | null> {
  const clientId = process.env.ORCID_MEMBER_CLIENT_ID?.trim()
  const clientSecret = process.env.ORCID_MEMBER_CLIENT_SECRET?.trim()
  if (!clientId || !clientSecret) return null

  const now = Date.now()
  if (memberTokenCache && memberTokenCache.expiresAt > now + 60_000) {
    return memberTokenCache.token
  }

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: 'client_credentials',
    scope: '/read-limited',
  })

  try {
    const res = await fetch('https://orcid.org/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    })
    if (!res.ok) return null
    const data = (await res.json()) as { access_token?: string; expires_in?: number }
    if (!data.access_token) return null
    const expiresIn = typeof data.expires_in === 'number' ? data.expires_in : 3600
    memberTokenCache = {
      token: data.access_token,
      expiresAt: now + expiresIn * 1000,
    }
    return data.access_token
  } catch {
    return null
  }
}

/** Server Member API token (env-gated). May only return public/limit-authorized emails. */
export async function fetchMemberOrcidEmailsServer(orcidId: string): Promise<string[]> {
  const token = await getOrcidMemberClientCredentialsToken()
  if (!token) return []
  return fetchOrcidEmailsWithAccessToken(orcidId, token)
}

export function userHasUsableAuthEmail(email: string | null | undefined): boolean {
  if (!email?.trim()) return false
  const lower = email.trim().toLowerCase()
  if (lower.endsWith('@orcid.local')) return false
  return normalizeContactEmail(email) !== null
}
