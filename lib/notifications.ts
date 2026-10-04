import { createClient } from './supabase/server'

/** Must match the pg_cron purge in supabase/migrations/20261004215906_notification_deletion_and_retention.sql */
export const NOTIFICATION_RETENTION_DAYS = 90

/** Hides rows past retention that the daily purge has not removed yet. */
export function getNotificationRetentionCutoffIso(now: Date = new Date()): string {
  const d = new Date(now)
  d.setUTCDate(d.getUTCDate() - NOTIFICATION_RETENTION_DAYS)
  return d.toISOString()
}

export interface Notification {
  id: string
  user_id: string
  type: string
  title: string
  body: string | null
  metadata: Record<string, unknown>
  read_at: string | null
  created_at: string
  dedupe_key?: string | null
}

export async function getUnreadNotifications(userId: string, limit = 20): Promise<Notification[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .eq('user_id', userId)
    .is('read_at', null)
    .gte('created_at', getNotificationRetentionCutoffIso())
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) return []
  return (data ?? []) as Notification[]
}

export async function getRecentNotifications(userId: string, limit = 10): Promise<Notification[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .eq('user_id', userId)
    .gte('created_at', getNotificationRetentionCutoffIso())
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) return []
  return (data ?? []) as Notification[]
}

export async function getUnreadNotificationCount(userId: string): Promise<number> {
  const supabase = await createClient()
  const { count, error } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .is('read_at', null)
    .gte('created_at', getNotificationRetentionCutoffIso())

  if (error) return 0
  return count ?? 0
}

export async function getNotificationsPage(
  userId: string,
  options: { limit?: number; offset?: number; unreadOnly?: boolean } = {}
): Promise<{ notifications: Notification[]; total: number }> {
  const { limit = 20, offset = 0, unreadOnly = false } = options
  const supabase = await createClient()

  let query = supabase
    .from('notifications')
    .select('*', { count: 'exact' })
    .eq('user_id', userId)
    .gte('created_at', getNotificationRetentionCutoffIso())
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (unreadOnly) {
    query = query.is('read_at', null)
  }

  const { data, error, count } = await query
  if (error) {
    return { notifications: [], total: 0 }
  }
  return { notifications: (data ?? []) as Notification[], total: count ?? 0 }
}

export async function markAllNotificationsRead(userId: string): Promise<boolean> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('user_id', userId)
    .is('read_at', null)

  return !error
}

/** Hard delete; RLS also restricts DELETE to the caller's own rows. */
export async function deleteNotification(
  userId: string,
  notificationId: string
): Promise<{ ok: true; deleted: boolean } | { ok: false; message: string }> {
  const supabase = await createClient()
  const { error, count } = await supabase
    .from('notifications')
    .delete({ count: 'exact' })
    .eq('id', notificationId)
    .eq('user_id', userId)

  if (error) return { ok: false, message: error.message }
  return { ok: true, deleted: (count ?? 0) > 0 }
}

/** Single set-based DELETE over idx_notifications_user_created. */
export async function deleteAllNotifications(
  userId: string
): Promise<{ ok: true; count: number } | { ok: false; message: string }> {
  const supabase = await createClient()
  const { error, count } = await supabase
    .from('notifications')
    .delete({ count: 'exact' })
    .eq('user_id', userId)

  if (error) return { ok: false, message: error.message }
  return { ok: true, count: count ?? 0 }
}
