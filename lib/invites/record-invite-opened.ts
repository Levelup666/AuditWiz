import type { SupabaseClient } from '@supabase/supabase-js'
import { createAuditEventWithClient } from '@/lib/supabase/audit'
import { generateHash } from '@/lib/crypto'
import type { ResolvedInvite } from '@/lib/invites/lookup-invite-by-token'

/** First successful resolution: set opened timestamp (idempotent) and emit invite_opened once. */
export async function recordInviteOpenedIfFirst(
  admin: SupabaseClient,
  resolved: ResolvedInvite
): Promise<void> {
  const table =
    resolved.kind === 'study' ? 'study_member_invites' : 'institution_invites'
  const { data: row } = await admin
    .from(table)
    .select('invite_first_opened_at')
    .eq('id', resolved.inviteId)
    .single()

  const already = row && (row as { invite_first_opened_at: string | null }).invite_first_opened_at
  if (already) return

  const now = new Date().toISOString()
  await admin.from(table).update({ invite_first_opened_at: now }).eq('id', resolved.inviteId)

  const studyId = resolved.kind === 'study' ? resolved.studyId : null
  const stateHash = await generateHash({
    invite_id: resolved.inviteId,
    kind: resolved.kind,
    opened_at: now,
  })

  await createAuditEventWithClient(
    admin,
    studyId,
    null,
    'invite_opened',
    resolved.kind === 'study' ? 'study_member_invite' : 'institution_invite',
    resolved.inviteId,
    null,
    stateHash,
    {
      kind: resolved.kind,
      ...(resolved.kind === 'study'
        ? { study_id: resolved.studyId }
        : { institution_id: resolved.institutionId }),
    }
  )
}
