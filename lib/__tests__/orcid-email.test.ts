import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import {
  extractEmailFromOrcidIdentityData,
  fetchPublicOrcidEmails,
  normalizeContactEmail,
  userHasUsableAuthEmail,
} from '@/lib/auth/orcid-email'
import { resolveOrcidContactEmail } from '@/lib/auth/orcid-email-resolve'
import { validateOrcidContactEmail } from '@/lib/auth/validate-orcid-email'
import { isOrcidPrimaryAccount } from '@/lib/auth/is-orcid-auth'
import {
  userNeedsOrcidEmailCapture,
  userNeedsOrcidEmailInput,
} from '@/lib/auth/orcid-email-requirements'
import { hasOrcidMemberApiCredentials, getOrcidOAuthScopes } from '@/lib/auth/orcid-provider'

describe('normalizeContactEmail', () => {
  it('normalizes valid emails', () => {
    expect(normalizeContactEmail('  Jane.Doe@Example.COM ')).toBe('jane.doe@example.com')
  })

  it('rejects invalid emails', () => {
    expect(normalizeContactEmail('not-an-email')).toBe(null)
  })
})

describe('extractEmailFromOrcidIdentityData', () => {
  it('reads string email claim', () => {
    expect(extractEmailFromOrcidIdentityData({ email: 'a@b.edu' })).toBe('a@b.edu')
  })

  it('reads nested email object', () => {
    expect(
      extractEmailFromOrcidIdentityData({ email: { value: 'nested@b.edu' } })
    ).toBe('nested@b.edu')
  })
})

describe('userHasUsableAuthEmail', () => {
  it('rejects placeholder orcid local emails', () => {
    expect(userHasUsableAuthEmail('user@orcid.local')).toBe(false)
  })

  it('accepts normal emails', () => {
    expect(userHasUsableAuthEmail('user@uni.edu')).toBe(true)
  })
})

describe('userNeedsOrcidEmailCapture', () => {
  it('is true for ORCID identity without profile verified yet', () => {
    expect(
      userNeedsOrcidEmailCapture(
        { email: null, identities: [{ provider: 'custom:orcid' }] },
        null
      )
    ).toBe(true)
  })

  it('is false when usable email exists', () => {
    expect(
      userNeedsOrcidEmailCapture(
        {
          email: 'user@uni.edu',
          identities: [{ provider: 'custom:orcid' }],
        },
        { orcid_id: '0000-0001-2345-6789', orcid_verified: true }
      )
    ).toBe(false)
  })
})

describe('userNeedsOrcidEmailInput', () => {
  it('is true when locked flag set but email is placeholder', () => {
    expect(
      userNeedsOrcidEmailInput(
        {
          email: 'x@orcid.local',
          identities: [{ provider: 'custom:orcid' }],
        },
        { orcid_id: '0000-0001-2345-6789', orcid_verified: true, orcid_email_locked: true }
      )
    ).toBe(true)
  })
})

describe('isOrcidPrimaryAccount', () => {
  it('is true when only ORCID identity exists', () => {
    expect(
      isOrcidPrimaryAccount(
        { identities: [{ provider: 'custom:orcid' }] },
        { orcid_email_locked: false }
      )
    ).toBe(true)
  })

  it('is false when email identity exists', () => {
    expect(
      isOrcidPrimaryAccount(
        {
          identities: [
            { provider: 'email' },
            { provider: 'custom:orcid' },
          ],
        },
        null
      )
    ).toBe(false)
  })
})

describe('resolveOrcidContactEmail', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('prefers identity email before public API', async () => {
    const fetchMock = vi.mocked(fetch)
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => [{ email: 'public@uni.edu', primary: true }],
    } as Response)

    const result = await resolveOrcidContactEmail({
      orcidId: '0000-0002-1825-0097',
      identityData: { email: 'oidc@uni.edu' },
    })

    expect(result.email).toBe('oidc@uni.edu')
    expect(result.source).toBe('identity')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('uses public record when identity has no email', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => [{ email: 'public@uni.edu', primary: true }],
    } as Response)

    const result = await resolveOrcidContactEmail({
      orcidId: '0000-0002-1825-0097',
      identityData: {},
    })

    expect(result.email).toBe('public@uni.edu')
    expect(result.source).toBe('public_record')
  })

  it('does not use existing auth email before public API', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => [],
    } as Response)

    const result = await resolveOrcidContactEmail({
      orcidId: '0000-0002-1825-0097',
      identityData: {},
      existingAuthEmail: 'user@orcid.local',
    })

    expect(result.email).toBe(null)
    expect(result.attempts.some((a) => a.source === 'existing' && !a.found)).toBe(true)
  })
})

describe('validateOrcidContactEmail', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('rejects email not on ORCID record', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => [{ email: 'on-record@uni.edu', primary: true }],
    } as Response)

    const result = await validateOrcidContactEmail({
      orcidId: '0000-0002-1825-0097',
      emailRaw: 'other@uni.edu',
    })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toContain('not listed')
    }
  })

  it('accepts email that matches public ORCID list', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => [{ email: 'on-record@uni.edu', primary: true }],
    } as Response)

    const result = await validateOrcidContactEmail({
      orcidId: '0000-0002-1825-0097',
      emailRaw: 'on-record@uni.edu',
    })

    expect(result).toEqual({ ok: true, mode: 'orcid_record' })
  })

  it('allows attested manual entry when no ORCID emails are discoverable', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => [],
    } as Response)

    const withoutAttest = await validateOrcidContactEmail({
      orcidId: '0000-0002-1825-0097',
      emailRaw: 'manual@uni.edu',
    })
    expect(withoutAttest.ok).toBe(false)
    if (!withoutAttest.ok) {
      expect(withoutAttest.requiresAttestation).toBe(true)
    }

    const withAttest = await validateOrcidContactEmail({
      orcidId: '0000-0002-1825-0097',
      emailRaw: 'manual@uni.edu',
      attested: true,
    })
    expect(withAttest).toEqual({ ok: true, mode: 'attested' })
  })
})

describe('getOrcidOAuthScopes', () => {
  const origId = process.env.ORCID_MEMBER_CLIENT_ID
  const origSecret = process.env.ORCID_MEMBER_CLIENT_SECRET

  afterEach(() => {
    if (origId === undefined) delete process.env.ORCID_MEMBER_CLIENT_ID
    else process.env.ORCID_MEMBER_CLIENT_ID = origId
    if (origSecret === undefined) delete process.env.ORCID_MEMBER_CLIENT_SECRET
    else process.env.ORCID_MEMBER_CLIENT_SECRET = origSecret
  })

  it('includes read-limited when member credentials exist', () => {
    process.env.ORCID_MEMBER_CLIENT_ID = 'id'
    process.env.ORCID_MEMBER_CLIENT_SECRET = 'secret'
    expect(getOrcidOAuthScopes()).toContain('/read-limited')
    expect(hasOrcidMemberApiCredentials()).toBe(true)
  })

  it('omits read-limited without member credentials', () => {
    delete process.env.ORCID_MEMBER_CLIENT_ID
    delete process.env.ORCID_MEMBER_CLIENT_SECRET
    expect(getOrcidOAuthScopes()).toBe('openid email')
  })
})

describe('fetchPublicOrcidEmails', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns normalized list from API', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => [
        { email: 'B@uni.edu', primary: false },
        { email: 'A@uni.edu', primary: true },
      ],
    } as Response)

    const emails = await fetchPublicOrcidEmails('0000-0002-1825-0097')
    expect(emails).toEqual(['a@uni.edu', 'b@uni.edu'])
  })
})
