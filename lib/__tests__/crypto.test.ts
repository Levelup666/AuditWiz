import { describe, it, expect } from 'vitest'
import {
  generateHash,
  generateSignatureHash,
  verifySignature,
} from '../crypto'

describe('generateHash', () => {
  it('returns a 64-character hex string for object input', async () => {
    const hash = await generateHash({ foo: 'bar' })
    expect(hash).toMatch(/^[a-f0-9]{64}$/)
  })

  it('returns a 64-character hex string for string input', async () => {
    const hash = await generateHash('hello')
    expect(hash).toMatch(/^[a-f0-9]{64}$/)
  })

  it('produces same hash for same content', async () => {
    const content = { a: 1, b: 'two' }
    const h1 = await generateHash(content)
    const h2 = await generateHash(content)
    expect(h1).toBe(h2)
  })

  it('produces different hashes for different content', async () => {
    const h1 = await generateHash({ a: 1 })
    const h2 = await generateHash({ a: 2 })
    expect(h1).not.toBe(h2)
  })

  it('is sensitive to key order in objects', async () => {
    const h1 = await generateHash({ a: 1, b: 2 })
    const h2 = await generateHash({ b: 2, a: 1 })
    expect(h1).not.toBe(h2)
  })
})

describe('generateSignatureHash', () => {
  it('returns a 64-character hex string', async () => {
    const hash = await generateSignatureHash(
      'record-123',
      1,
      'user-456',
      'approval',
      '2024-01-01T00:00:00Z'
    )
    expect(hash).toMatch(/^[a-f0-9]{64}$/)
  })

  it('produces same hash for same inputs', async () => {
    const hash1 = await generateSignatureHash(
      'r1',
      1,
      'u1',
      'approval',
      '2024-01-01T00:00:00Z'
    )
    const hash2 = await generateSignatureHash(
      'r1',
      1,
      'u1',
      'approval',
      '2024-01-01T00:00:00Z'
    )
    expect(hash1).toBe(hash2)
  })

  it('produces different hashes for different record IDs', async () => {
    const hash1 = await generateSignatureHash(
      'r1',
      1,
      'u1',
      'approval',
      '2024-01-01T00:00:00Z'
    )
    const hash2 = await generateSignatureHash(
      'r2',
      1,
      'u1',
      'approval',
      '2024-01-01T00:00:00Z'
    )
    expect(hash1).not.toBe(hash2)
  })
})

describe('verifySignature', () => {
  it('returns true when signature matches', async () => {
    const recordId = 'rec-1'
    const version = 1
    const signerId = 'user-1'
    const intent = 'approval'
    const timestamp = '2024-01-01T00:00:00Z'
    const signatureHash = await generateSignatureHash(
      recordId,
      version,
      signerId,
      intent,
      timestamp
    )
    const valid = await verifySignature(
      signatureHash,
      recordId,
      version,
      signerId,
      intent,
      timestamp
    )
    expect(valid).toBe(true)
  })

  it('returns false when signature does not match', async () => {
    const recordId = 'rec-1'
    const version = 1
    const signerId = 'user-1'
    const intent = 'approval'
    const timestamp = '2024-01-01T00:00:00Z'
    const wrongHash = await generateHash('tampered')
    const valid = await verifySignature(
      wrongHash,
      recordId,
      version,
      signerId,
      intent,
      timestamp
    )
    expect(valid).toBe(false)
  })

  it('returns false when any parameter is wrong', async () => {
    const recordId = 'rec-1'
    const version = 1
    const signerId = 'user-1'
    const intent = 'approval'
    const timestamp = '2024-01-01T00:00:00Z'
    const signatureHash = await generateSignatureHash(
      recordId,
      version,
      signerId,
      intent,
      timestamp
    )
    const valid = await verifySignature(
      signatureHash,
      'wrong-record',
      version,
      signerId,
      intent,
      timestamp
    )
    expect(valid).toBe(false)
  })
})
