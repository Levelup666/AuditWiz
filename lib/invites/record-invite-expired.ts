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

export async function recordInviteExpiredAuditIfFirst(
  admin: SupabaseClient,
  resolved: ResolvedInvite
): Promise<void> {
  const table = tableForResolved(resolved.kind)
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

  const metadata: Record<string, unknown> = { kind: resolved.kind }
  if (resolved.kind === 'study') {
    metadata.study_id = resolved.studyId
  } else if (resolved.kind === 'institution') {
    metadata.institution_id = resolved.institutionId
  } else {
    metadata.institution_id = resolved.institutionId
    metadata.engagement_id = resolved.inviteId
  }

  // For audit_engagements, also emit the dedicated audit_engagement_expired event so the
  // institution-admin activity view surfaces it without filtering generic invite_expired.
  if (resolved.kind === 'audit_engagement') {
    const expHash = await generateHash({
      engagement_id: resolved.inviteId,
      kind: 'audit_engagement',
      expired_recorded_at: now,
    })
    await createAuditEventWithClient(
      admin,
      null,
      null,
      'audit_engagement_expired',
      'audit_engagement',
      resolved.inviteId,
      null,
      expHash,
      { institution_id: resolved.institutionId }
    )
  }

  await createAuditEventWithClient(
    admin,
    studyId,
    null,
    'invite_expired',
    targetEntityType(resolved.kind),
    resolved.inviteId,
    null,
    stateHash,
    metadata
  )
}
