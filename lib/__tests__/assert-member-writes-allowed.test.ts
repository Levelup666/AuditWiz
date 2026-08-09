import { describe, expect, it } from 'vitest'
import {
  auditorContextBlocksApiWrite,
  isAuditorContextWriteAllowedPath,
  memberWritesBlockedByCookie,
} from '@/lib/auditor/assert-member-writes-allowed'

describe('memberWritesBlockedByCookie', () => {
  it('blocks only auditor cookie', () => {
    expect(memberWritesBlockedByCookie('auditor')).toBe(true)
    expect(memberWritesBlockedByCookie('member')).toBe(false)
    expect(memberWritesBlockedByCookie(null)).toBe(false)
    expect(memberWritesBlockedByCookie(undefined)).toBe(false)
  })
})

describe('auditorContextBlocksApiWrite', () => {
  it('blocks member write APIs under auditor cookie', () => {
    expect(
      auditorContextBlocksApiWrite('POST', '/api/records/x/sign', 'auditor')
    ).toBe(true)
    expect(
      auditorContextBlocksApiWrite('PATCH', '/api/studies/x/members', 'auditor')
    ).toBe(true)
  })

  it('allows GET and allowlisted paths', () => {
    expect(
      auditorContextBlocksApiWrite('GET', '/api/records/x/documents', 'auditor')
    ).toBe(false)
    expect(
      auditorContextBlocksApiWrite('POST', '/api/auditor/context', 'auditor')
    ).toBe(false)
    expect(
      auditorContextBlocksApiWrite('POST', '/api/invites/accept', 'auditor')
    ).toBe(false)
    expect(
      auditorContextBlocksApiWrite('POST', '/api/records/x/sign', 'member')
    ).toBe(false)
  })
})

describe('isAuditorContextWriteAllowedPath', () => {
  it('matches prefixes', () => {
    expect(isAuditorContextWriteAllowedPath('/api/auditor/engagements/1/access')).toBe(
      true
    )
    expect(isAuditorContextWriteAllowedPath('/api/institutions/1/auditors')).toBe(false)
  })
})
