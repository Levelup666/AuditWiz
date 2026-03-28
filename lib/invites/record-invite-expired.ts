import type { SupabaseClient } from '@supabase/supabase-js'
import { createAuditEventWithClient } from '@/lib/supabase/audit'
import { generateHash } from '@/lib/crypto'
import type { ResolvedInvite } from '@/lib/invites/lookup-invite-by-token'

export async function recordInviteExpiredAuditIfFirst(
  admin: SupabaseClient,
  resolved: ResolvedInvite
): Promise<void> {
  const table =
    resolved.kind === 'study' ? 'study_member_invites' : 'institution_invites'
  const { data: row } = await admin
    .from(table)
    .select('expiry_audit_logged_at')
    .eq('id', resolved.inviteId)
    .single()

  const logged = row && (row as { expiry_audit_logged_at: string | null }).expiry_audit_logged_at
  if (logged) return

  const now = new Date().toISOString()
  await admin.from(table).update({ expiry_audit_logged_at: now }).eq('id', resolved.inviteId)

  const studyId = resolved.kind === 'study' ? resolved.studyId : null
  const stateHash = await generateHash({
    invite_id: resolved.inviteId,
    kind: resolved.kind,
    expired_recorded_at: now,
  })

  await createAuditEventWithClient(
    admin,
    studyId,
    null,
    'invite_expired',
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
