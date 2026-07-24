import { describe, expect, it } from 'vitest'
import {
  auditorSetupPathForToken,
  inviteTokenFromPath,
  isInviteTokenPath,
} from '@/lib/invites/auditor-invite-flow'
import { parseAuditorEmails } from '@/lib/auditor/issue-audit-engagement'

describe('auditor-invite-flow', () => {
  it('extracts token from invite path', () => {
    expect(inviteTokenFromPath('/invite/abc123')).toBe('abc123')
    expect(isInviteTokenPath('/invite/abc123')).toBe(true)
  })

  it('builds token-aware setup path', () => {
    const path = auditorSetupPathForToken('tok')
    expect(path).toContain('invite_token=tok')
    expect(path).toContain('auditor_invite=1')
    expect(path).toContain('next=%2Finvite%2Ftok')
  })
})

describe('parseAuditorEmails', () => {
  it('dedupes and parses multiple emails', () => {
    expect(
      parseAuditorEmails({
        auditor_emails: ['a@x.com', 'A@x.com'],
        auditor_email: 'b@x.com',
      })
    ).toEqual(['a@x.com', 'b@x.com'])
  })
})
