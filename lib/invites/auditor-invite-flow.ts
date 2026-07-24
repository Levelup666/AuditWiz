/** Helpers for audit-engagement invite onboarding (token-preserving paths). */

export function inviteTokenFromPath(path: string): string | null {
  const trimmed = path.trim()
  const match = /^\/invite\/([^/?#]+)/.exec(trimmed)
  return match?.[1] ? decodeURIComponent(match[1]) : null
}

export function isInviteTokenPath(path: string): boolean {
  return inviteTokenFromPath(path) !== null
}

export function invitePathForToken(rawToken: string): string {
  return `/invite/${encodeURIComponent(rawToken.trim())}`
}

export function auditorSetupPathForToken(rawToken: string): string {
  const token = rawToken.trim()
  const invitePath = invitePathForToken(token)
  const params = new URLSearchParams({
    next: invitePath,
    invite_token: token,
    auditor_invite: '1',
  })
  return `/account/setup?${params.toString()}`
}

export function auditorSetupPathFromInvitePath(invitePath: string): string | null {
  const token = inviteTokenFromPath(invitePath)
  if (!token) return null
  return auditorSetupPathForToken(token)
}

export function signupRedirectForInvitePath(invitePath: string): string {
  return invitePath
}
