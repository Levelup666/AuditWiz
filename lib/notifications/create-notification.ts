import type { SupabaseClient } from '@supabase/supabase-js'

/** V1 in-app notification types (whitelist). */
export type NotificationType =
  | 'study_task_assigned'
  | 'study_task_due_soon'
  | 'study_member_joined'
  | 'study_member_departed'
  | 'study_deleted'

export type NotificationInsert = {
  user_id: string
  type: NotificationType
  title: string
  body?: string | null
  metadata?: Record<string, unknown>
  dedupe_key?: string | null
}

export async function createNotifications(
  admin: SupabaseClient,
  rows: NotificationInsert[]
): Promise<{ ok: true; count: number } | { ok: false; message: string }> {
  if (rows.length === 0) {
    return { ok: true, count: 0 }
  }

  const payload = rows.map((r) => ({
    user_id: r.user_id,
    type: r.type,
    title: r.title,
    body: r.body ?? null,
    metadata: r.metadata ?? {},
    dedupe_key: r.dedupe_key ?? null,
  }))

  const { error } = await admin.from('notifications').insert(payload)
  if (error) {
    if (error.code === '23505') {
      return { ok: true, count: 0 }
    }
    return { ok: false, message: error.message }
  }
  return { ok: true, count: rows.length }
}

export async function createNotificationIfNew(
  admin: SupabaseClient,
  row: NotificationInsert
): Promise<{ ok: true; created: boolean } | { ok: false; message: string }> {
  const result = await createNotifications(admin, [row])
  if (!result.ok) {
    return { ok: false, message: result.message }
  }
  return { ok: true, created: result.count > 0 }
}
