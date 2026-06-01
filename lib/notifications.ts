import { createClient } from './supabase/server'

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
