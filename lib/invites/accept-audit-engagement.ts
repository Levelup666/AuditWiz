import type { SupabaseClient } from '@supabase/supabase-js'
import { createAuditEvent } from '@/lib/supabase/audit'
import { generateHash } from '@/lib/crypto'
import {
  AUDITOR_ATTESTATION_STATEMENT,
  validateAuditorCredentials,
  type AuditorCredentialsInput,
} from '@/lib/auditor/auditor-credentials'
import {
  AUDITOR_COI_STATEMENT,
  validateAuditorCoi,
  type AuditorCoiInput,
} from '@/lib/auditor/auditor-coi'

export type AcceptAuditEngagementResult =
  | { ok: true; engagementId: string; institutionId: string }
  | { ok: false; status: number; error: string; code?: string }

function mapAcceptRpcError(message: string | undefined): AcceptAuditEngagementResult {
  const m = (message ?? '').toLowerCase()
  if (m.includes('not_found') || m.includes('p0002')) {
    return { ok: false, status: 404, error: 'Engagement not found' }
  }
  if (m.includes('revoked')) {
    return { ok: false, status: 410, error: 'This audit engagement was revoked.' }
  }
  if (m.includes('expired')) {
    return { ok: false, status: 410, error: 'This audit engagement has expired.' }
  }
  if (m.includes('already_accepted')) {
    return {
      ok: false,
      status: 409,
      error: 'This engagement was already accepted by another user.',
    }
  }
  if (m.includes('email_mismatch') || m.includes('42501') || m.includes('not_authenticated')) {
    return {
      ok: false,
      status: 403,
      error: 'This audit engagement was issued to a different email address.',
    }
  }
  if (m.includes('organization_required') || m.includes('attestation_required')) {
    return { ok: false, status: 400, error: message ?? 'Credentials required', code: 'credentials_required' }
  }
  if (m.includes('coi_')) {
    return { ok: false, status: 400, error: message ?? 'COI declaration required', code: 'coi_required' }
  }
  return {
    ok: false,
    status: 500,
    error: message ?? 'Could not accept this audit engagement.',
  }
}

/**
 * Accept an audit engagement via SECURITY DEFINER RPC (column-safe).
 * App validates credentials/COI and hashes statements; RPC enforces required fields
 * and email match. Must NOT call study collaboration policy helpers.
 */
export async function acceptAuditEngagementForUser(
  supabase: SupabaseClient,
  userId: string,
  userEmail: string | undefined,
  institutionId: string,
  engagementId: string,
  credentialsInput: AuditorCredentialsInput,
  coiInput: AuditorCoiInput
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

  const coiValidated = validateAuditorCoi(coiInput)
  if (!coiValidated.ok) {
    return {
      ok: false,
      status: 400,
      error: coiValidated.error,
      code: 'coi_required',
    }
  }

  const { credentials } = validated
  const { coi } = coiValidated
  const attestationTextHash = await generateHash({
    statement: AUDITOR_ATTESTATION_STATEMENT,
    organization: credentials.organizationName,
    title: credentials.title,
    reference_id: credentials.referenceId,
  })
  const coiStatementHash = await generateHash({
    statement: AUDITOR_COI_STATEMENT,
    has_conflict: coi.hasConflict,
    disclosure: coi.disclosure,
  })

  const { data: rpcId, error: rpcError } = await supabase.rpc('accept_audit_engagement', {
    p_engagement_id: engagementId,
    p_organization_name: credentials.organizationName,
    p_title: credentials.title,
    p_reference_id: credentials.referenceId,
    p_attestation_text_hash: attestationTextHash,
    p_coi_statement_hash: coiStatementHash,
    p_coi_has_conflict: coi.hasConflict,
    p_coi_disclosure: coi.disclosure,
  })

  if (rpcError) {
    return mapAcceptRpcError(rpcError.message)
  }
  if (!rpcId) {
    return {
      ok: false,
      status: 500,
      error: 'Could not accept this audit engagement. It may have just been revoked or expired.',
    }
  }

  const nowIso = new Date().toISOString()
  const acceptHash = await generateHash({
    engagement_id: engagementId,
    institution_id: institutionId,
    auditor_user_id: userId,
    accepted_at: nowIso,
    attestation_text_hash: attestationTextHash,
    coi_statement_hash: coiStatementHash,
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
      auditor_reference_id_present: Boolean(credentials.referenceId),
      coi_statement_hash: coiStatementHash,
      coi_has_conflict: coi.hasConflict,
      coi_disclosure_present: Boolean(coi.disclosure),
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
