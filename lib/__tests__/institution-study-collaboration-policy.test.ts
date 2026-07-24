import { describe, expect, it, vi, beforeEach } from 'vitest'
import {
  institutionMembersOnlyStudyCollaboration,
  studyCollaborationBlockedByMembersOnlyPolicy,
} from '@/lib/institution-study-collaboration-policy'

vi.mock('@/lib/supabase/permissions', () => ({
  isActiveInstitutionMember: vi.fn(),
}))

import { isActiveInstitutionMember } from '@/lib/supabase/permissions'

const mockIsActiveInstitutionMember = vi.mocked(isActiveInstitutionMember)

describe('institutionMembersOnlyStudyCollaboration', () => {
  it('is false when external collaborators allowed', () => {
    expect(
      institutionMembersOnlyStudyCollaboration({
        institutionId: 'inst-1',
        allowExternalCollaborators: true,
      })
    ).toBe(false)
  })

  it('is false without institution', () => {
    expect(
      institutionMembersOnlyStudyCollaboration({
        institutionId: null,
        allowExternalCollaborators: false,
      })
    ).toBe(false)
  })

  it('is true when members-only on an institution', () => {
    expect(
      institutionMembersOnlyStudyCollaboration({
        institutionId: 'inst-1',
        allowExternalCollaborators: false,
      })
    ).toBe(true)
  })
})

describe('studyCollaborationBlockedByMembersOnlyPolicy', () => {
  beforeEach(() => {
    mockIsActiveInstitutionMember.mockReset()
  })

  it('returns false when external collaborators allowed', async () => {
    const blocked = await studyCollaborationBlockedByMembersOnlyPolicy({
      allowExternalCollaborators: true,
      institutionId: 'inst-1',
      userId: 'user-1',
    })
    expect(blocked).toBe(false)
    expect(mockIsActiveInstitutionMember).not.toHaveBeenCalled()
  })

  it('returns false when user is institution member under members-only', async () => {
    mockIsActiveInstitutionMember.mockResolvedValue(true)
    const blocked = await studyCollaborationBlockedByMembersOnlyPolicy({
      allowExternalCollaborators: false,
      institutionId: 'inst-1',
      userId: 'user-1',
    })
    expect(blocked).toBe(false)
    expect(mockIsActiveInstitutionMember).toHaveBeenCalledWith('user-1', 'inst-1')
  })

  it('returns true when members-only and user is not institution member', async () => {
    mockIsActiveInstitutionMember.mockResolvedValue(false)
    const blocked = await studyCollaborationBlockedByMembersOnlyPolicy({
      allowExternalCollaborators: false,
      institutionId: 'inst-1',
      userId: 'user-1',
    })
    expect(blocked).toBe(true)
  })
})

describe('accept-audit-engagement policy isolation', () => {
  it('does not import study collaboration policy helpers', async () => {
    const fs = await import('node:fs')
    const path = await import('node:path')
    const source = fs.readFileSync(
      path.join(process.cwd(), 'lib/invites/accept-audit-engagement.ts'),
      'utf8'
    )
    expect(source).not.toMatch(/from ['"]@\/lib\/institution-study-collaboration-policy['"]/)
    expect(source).not.toContain('studyCollaborationBlockedByMembersOnlyPolicy')
  })
})
