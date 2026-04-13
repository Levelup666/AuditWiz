import { createAdminClient } from '@/lib/supabase/admin'

export async function getActorEmailsForAudit(
  actorIds: string[]
): Promise<Record<string, string>> {
  const admin = createAdminClient()
  const emails: Record<string, string> = {}
  await Promise.all(
    actorIds.map(async (id) => {
      try {
        const { data } = await admin.auth.admin.getUserById(id)
        emails[id] = data.user?.email ?? id.slice(0, 8) + '…'
      } catch {
        emails[id] = id.slice(0, 8) + '…'
      }
    })
  )
  return emails
}
