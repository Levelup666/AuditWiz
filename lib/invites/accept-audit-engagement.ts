import type { SupabaseClient } from '@supabase/supabase-js'
import { createAuditEvent } from '@/lib/supabase/audit'
import { generateHash } from '@/lib/crypto'

export type AcceptAuditEngagementResult =
  | { ok: true; engagementId: string; institutionId: string }
  | { ok: false; status: number; error: string }

/**
 * Accept an audit engagement: ties the auditor's auth user_id to the engagement and emits
 * audit events. The Supabase session must belong to the invitee email — RLS enforces that
 * via the "Invitee can accept own pending engagement" policy.
 */
export async function acceptAuditEngagementForUser(
  supabase: SupabaseClient,
  userId: string,
  userEmail: string | undefined,
  institutionId: string,
  engagementId: string
): Promise<AcceptAuditEngagementResult> {
  const { data: engagement, error: fetchError } = await supabase
    .from('audit_engagements')
    .select('id, institution_id, auditor_email, auditor_user_id, accepted_at, revoked_at, expires_at, starts_at, scope, purpose, granted_by')
    .eq('id', engagementId)
    .eq('institution_id', institutionId)
    .single()

  if (fetchError || !engagement) {
    return { ok: false, status: 404, error: 'Engagement not found' }
  }

  if (engagement.revoked_at) {
    return { ok: false, status: 410, error: 'This audit engagement was revoked.' }
  }
  if (engagement.accepted_at && engagement.auditor_user_id && engagement.auditor_user_id !== userId) {
    return { ok: false, status: 409, error: 'This engagement was already accepted by another user.' }
  }
  if (engagement.accepted_at && engagement.auditor_user_id === userId) {
    return { ok: true, engagementId: engagement.id, institutionId: engagement.institution_id }
  }
  if (new Date(engagement.expires_at) <= new Date()) {
    return { ok: false, status: 410, error: 'This audit engagement has expired.' }
  }

  const userEmailNorm = userEmail?.trim().toLowerCase() ?? ''
  const inviteEmailNorm = engagement.auditor_email?.trim().toLowerCase() ?? ''
  if (!userEmailNorm || userEmailNorm !== inviteEmailNorm) {
    return {
      ok: false,
      status: 403,
      error: 'This audit engagement was issued to a different email address.',
    }
  }

  const nowIso = new Date().toISOString()
  const { data: updated, error: updateError } = await supabase
    .from('audit_engagements')
    .update({
      accepted_at: nowIso,
      auditor_user_id: userId,
    })
    .eq('id', engagementId)
    .is('accepted_at', null)
    .is('revoked_at', null)
    .gt('expires_at', nowIso)
    .select('id')

  if (updateError || !updated?.length) {
    return {
      ok: false,
      status: 500,
      error:
        updateError?.message ??
        'Could not accept this audit engagement. It may have just been revoked or expired.',
    }
  }

  const acceptHash = await generateHash({
    engagement_id: engagementId,
    institution_id: institutionId,
    auditor_user_id: userId,
    accepted_at: nowIso,
  })

  await createAuditEvent(
    null,
    userId,
    'audit_engagement_accepted',
    'audit_engagement',
    engagementId,
    null,
    acceptHash,
    {
      institution_id: institutionId,
      scope: engagement.scope,
      purpose: engagement.purpose,
      starts_at: engagement.starts_at,
      expires_at: engagement.expires_at,
    }
  )

  const inviteAcceptedHash = await generateHash({
    kind: 'audit_engagement',
    invite_id: engagementId,
    institution_id: institutionId,
    user_id: userId,
  })
  await createAuditEvent(
    null,
    userId,
    'invite_accepted',
    'audit_engagement',
    engagementId,
    null,
    inviteAcceptedHash,
    { institution_id: institutionId, role: 'auditor' }
  )

  return { ok: true, engagementId: engagement.id, institutionId: engagement.institution_id }
}
