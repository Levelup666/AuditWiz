/** Notify client UI (e.g. nav badge) to refetch pending invite counts. */
export function notifyInvitesChanged() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('invites-updated'))
  }
}
