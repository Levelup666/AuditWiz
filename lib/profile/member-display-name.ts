/**
 * Peer-visible label for member lists and dropdowns.
 * Nickname wins; else "First L."; else first-only; else legacy display_name; else fallbacks.
 */
export type MemberDisplayProfileInput = {
  nickname?: string | null
  first_name?: string | null
  last_name?: string | null
  display_name?: string | null
}

export type MemberDisplayFallbacks = {
  email?: string | null
  userId?: string | null
}

export function formatMemberListName(
  p: MemberDisplayProfileInput,
  fallbacks?: MemberDisplayFallbacks
): string {
  const nick = p.nickname?.trim()
  if (nick) return nick

  const first = p.first_name?.trim()
  const last = p.last_name?.trim()
  if (first && last) {
    const initial = last.charAt(0).toUpperCase()
    return `${first} ${initial}.`
  }
  if (first) return first

  const legacy = p.display_name?.trim()
  if (legacy) return legacy

  const email = fallbacks?.email?.trim()
  if (email) return email

  const uid = fallbacks?.userId
  if (uid) return uid.slice(0, 8) + '…'

  return 'Unknown'
}

/** Value to persist on profiles.display_name for backward-compatible queries. */
export function profileDisplayNameForDb(p: MemberDisplayProfileInput): string | null {
  const nick = p.nickname?.trim()
  if (nick) return nick

  const first = p.first_name?.trim()
  const last = p.last_name?.trim()
  if (first && last) {
    return `${first} ${last.charAt(0).toUpperCase()}.`
  }
  if (first) return first

  const legacy = p.display_name?.trim()
  if (legacy) return legacy

  return null
}
