import type { SupabaseClient } from '@supabase/supabase-js'

/** Admin client: resolve auth user id by email, or null. */
export async function findUserIdByEmail(
  admin: SupabaseClient,
  email: string
): Promise<string | null> {
  const normalized = email.trim().toLowerCase()
  let page = 1
  const perPage = 1000
  for (;;) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage })
    if (error) return null
    const found = data.users.find((u) => u.email?.toLowerCase() === normalized)
    if (found) return found.id
    if (!data.users.length || data.users.length < perPage) return null
    page += 1
    if (page > 50) return null
  }
}
