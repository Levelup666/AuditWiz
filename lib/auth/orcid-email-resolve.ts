import {
  extractEmailFromOrcidIdentityData,
  fetchMemberOrcidEmailsServer,
  fetchOrcidEmailsWithAccessToken,
  fetchPublicOrcidEmails,
  fetchPublicOrcidPrimaryEmail,
  normalizeContactEmail,
  userHasUsableAuthEmail,
} from '@/lib/auth/orcid-email'
import { hasOrcidMemberApiCredentials } from '@/lib/auth/orcid-provider'

export type OrcidEmailSource =
  | 'identity'
  | 'provider_token'
  | 'member_api'
  | 'public_record'
  | 'existing'

export type EmailResolveAttempt = {
  source: OrcidEmailSource
  found: boolean
}

export type ResolveOrcidContactEmailResult = {
  email: string | null
  source: OrcidEmailSource | null
  attempts: EmailResolveAttempt[]
  allowedEmails: string[]
}

function pickPrimaryFromList(emails: string[]): string | null {
  return emails[0] ?? null
}

function mergeAllowedEmails(...lists: string[][]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const list of lists) {
    for (const e of list) {
      if (!seen.has(e)) {
        seen.add(e)
        out.push(e)
      }
    }
  }
  return out
}

/**
 * Tiered ORCID contact email resolution (identity → provider token → member API → public → existing auth).
 */
export async function resolveOrcidContactEmail(params: {
  orcidId: string
  identityData?: Record<string, unknown> | null
  existingAuthEmail?: string | null
  providerAccessToken?: string | null
}): Promise<ResolveOrcidContactEmailResult> {
  const { orcidId, identityData, existingAuthEmail, providerAccessToken } = params
  const attempts: EmailResolveAttempt[] = []
  const allowedLists: string[][] = []

  const fromIdentity = extractEmailFromOrcidIdentityData(identityData)
  attempts.push({ source: 'identity', found: Boolean(fromIdentity) })
  if (fromIdentity) {
    allowedLists.push([fromIdentity])
    return {
      email: fromIdentity,
      source: 'identity',
      attempts,
      allowedEmails: mergeAllowedEmails(...allowedLists),
    }
  }

  if (providerAccessToken?.trim()) {
    const fromToken = await fetchOrcidEmailsWithAccessToken(orcidId, providerAccessToken.trim())
    attempts.push({ source: 'provider_token', found: fromToken.length > 0 })
    allowedLists.push(fromToken)
    const primary = pickPrimaryFromList(fromToken)
    if (primary) {
      return {
        email: primary,
        source: 'provider_token',
        attempts,
        allowedEmails: mergeAllowedEmails(...allowedLists),
      }
    }
  } else {
    attempts.push({ source: 'provider_token', found: false })
  }

  if (hasOrcidMemberApiCredentials()) {
    const fromMember = await fetchMemberOrcidEmailsServer(orcidId)
    attempts.push({ source: 'member_api', found: fromMember.length > 0 })
    allowedLists.push(fromMember)
    const primary = pickPrimaryFromList(fromMember)
    if (primary) {
      return {
        email: primary,
        source: 'member_api',
        attempts,
        allowedEmails: mergeAllowedEmails(...allowedLists),
      }
    }
  }

  const fromPublicList = await fetchPublicOrcidEmails(orcidId)
  attempts.push({ source: 'public_record', found: fromPublicList.length > 0 })
  allowedLists.push(fromPublicList)
  const fromPublic = pickPrimaryFromList(fromPublicList) ?? (await fetchPublicOrcidPrimaryEmail(orcidId))
  if (fromPublic) {
    return {
      email: fromPublic,
      source: 'public_record',
      attempts,
      allowedEmails: mergeAllowedEmails(...allowedLists),
    }
  }

  if (userHasUsableAuthEmail(existingAuthEmail)) {
    const existing = normalizeContactEmail(existingAuthEmail!)!
    attempts.push({ source: 'existing', found: true })
    allowedLists.push([existing])
    return {
      email: existing,
      source: 'existing',
      attempts,
      allowedEmails: mergeAllowedEmails(...allowedLists),
    }
  }
  attempts.push({ source: 'existing', found: false })

  return {
    email: null,
    source: null,
    attempts,
    allowedEmails: mergeAllowedEmails(...allowedLists),
  }
}

/** Load all discoverable ORCID emails for validation (same tiers, no early return on first hit). */
export async function loadAllowedOrcidEmails(params: {
  orcidId: string
  identityData?: Record<string, unknown> | null
  providerAccessToken?: string | null
}): Promise<{ emails: string[]; attempts: EmailResolveAttempt[] }> {
  const result = await resolveOrcidContactEmail(params)
  return { emails: result.allowedEmails, attempts: result.attempts }
}
