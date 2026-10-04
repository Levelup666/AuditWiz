/** Browser event fired after the inbox changes so the nav unread badge can refetch. */
export const NOTIFICATIONS_CHANGED_EVENT = 'auditwiz:notifications-changed'

export function emitNotificationsChanged(): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED_EVENT))
}
