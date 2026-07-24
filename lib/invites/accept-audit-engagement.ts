import type { SupabaseClient } from '@supabase/supabase-js'
import { createAuditEvent } from '@/lib/supabase/audit'
import { generateHash } from '@/lib/crypto'
import {
  AUDITOR_ATTESTATION_STATEMENT,
  validateAuditorCredentials,
  type AuditorCredentialsInput,
} from '@/lib/auditor/auditor-credentials'

export type AcceptAuditEngagementResult =
  | { ok: true; engagementId: string; institutionId: string }
  | { ok: false; status: number; error: string; code?: string }

/**
 * Accept an audit engagement: ties the auditor's auth user_id to the engagement, records
 * attested credentials, and emits audit events. The Supabase session must belong to the
 * invitee email — RLS enforces that via the "Invitee can accept own pending engagement" policy.
 *
 * Must NOT call study collaboration policy helpers; audit engagements are out of scope for
 * allow_external_collaborators (institution members only on studies).
 */
export async function acceptAuditEngagementForUser(
  supabase: SupabaseClient,
  userId: string,
  userEmail: string | undefined,
  institutionId: string,
  engagementId: string,
  credentialsInput: AuditorCredentialsInput
): Promise<AcceptAuditEngagementResult> {
  const { data: engagement, error: fetchError } = await supabase
    .from('audit_engagements')
    .select(
      'id, institution_id, auditor_email, auditor_user_id, accepted_at, revoked_at, expires_at, starts_at, scope, purpose, granted_by'
    )
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

  const { data: institution } = await supabase
    .from('institutions')
    .select('metadata')
    .eq('id', institutionId)
    .maybeSingle()

  const validated = validateAuditorCredentials(credentialsInput, institution?.metadata)
  if (!validated.ok) {
    return {
      ok: false,
      status: 400,
      error: validated.error,
      code: 'credentials_required',
    }
  }

  const { credentials } = validated
  const nowIso = new Date().toISOString()
  const attestationTextHash = await generateHash({
    statement: AUDITOR_ATTESTATION_STATEMENT,
    organization: credentials.organizationName,
    title: credentials.title,
    reference_id: credentials.referenceId,
  })

  const { data: updated, error: updateError } = await supabase
    .from('audit_engagements')
    .update({
      accepted_at: nowIso,
      auditor_user_id: userId,
      auditor_organization_name: credentials.organizationName,
      auditor_title: credentials.title,
      auditor_reference_id: credentials.referenceId,
      attested_at: nowIso,
      attestation_text_hash: attestationTextHash,
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
    attestation_text_hash: attestationTextHash,
    auditor_organization_name: credentials.organizationName,
    auditor_reference_id: credentials.referenceId,
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
      attestation_text_hash: attestationTextHash,
      auditor_organization_name: credentials.organizationName,
      auditor_title: credentials.title,
      // Hash of reference id only in ledger metadata for attribution without storing raw id twice
      auditor_reference_id_present: Boolean(credentials.referenceId),
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
