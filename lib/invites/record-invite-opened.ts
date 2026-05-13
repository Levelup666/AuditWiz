import type { SupabaseClient } from '@supabase/supabase-js'
import { createAuditEventWithClient } from '@/lib/supabase/audit'
import { generateHash } from '@/lib/crypto'
import type { ResolvedInvite } from '@/lib/invites/lookup-invite-by-token'

function tableForResolved(kind: ResolvedInvite['kind']): string {
  if (kind === 'study') return 'study_member_invites'
  if (kind === 'institution') return 'institution_invites'
  return 'audit_engagements'
}

function targetEntityType(kind: ResolvedInvite['kind']): string {
  if (kind === 'study') return 'study_member_invite'
  if (kind === 'institution') return 'institution_invite'
  return 'audit_engagement'
}

/** First successful resolution: set opened timestamp (idempotent) and emit invite_opened once. */
export async function recordInviteOpenedIfFirst(
  admin: SupabaseClient,
  resolved: ResolvedInvite
): Promise<void> {
  const table = tableForResolved(resolved.kind)
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

  const metadata: Record<string, unknown> = { kind: resolved.kind }
  if (resolved.kind === 'study') {
    metadata.study_id = resolved.studyId
  } else if (resolved.kind === 'institution') {
    metadata.institution_id = resolved.institutionId
  } else {
    metadata.institution_id = resolved.institutionId
    metadata.engagement_id = resolved.inviteId
  }

  await createAuditEventWithClient(
    admin,
    studyId,
    null,
    'invite_opened',
    targetEntityType(resolved.kind),
    resolved.inviteId,
    null,
    stateHash,
    metadata
  )
}
