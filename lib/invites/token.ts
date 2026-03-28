import { createHash, randomBytes } from 'crypto'

/** URL-safe opaque token; only its SHA-256 hex digest is stored. */
export function generateInviteToken(): { rawToken: string; tokenHash: string } {
  const rawToken = randomBytes(32).toString('base64url')
  const tokenHash = hashInviteToken(rawToken)
  return { rawToken, tokenHash }
}

export function hashInviteToken(rawToken: string): string {
  return createHash('sha256').update(rawToken, 'utf8').digest('hex')
}
