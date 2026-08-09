// Institution-admin issuance of time-boxed read-only audit engagements.
// Must NOT call study collaboration policy helpers (allow_external_collaborators);
// auditors are granted via audit_engagements, not study_members.

import type { SupabaseClient } from '@supabase/supabase-js'
import { createAuditEvent } from '@/lib/supabase/audit'
import { generateHash } from '@/lib/crypto'
import { generateInviteToken } from '@/lib/invites/token'
import {
  sendExistingUserPendingInviteNotification,
  sendPendingInviteEmail,
  type PendingInviteEmailResult,
} from '@/lib/email/pending-invite-notification'
import { findUserIdByEmail } from '@/lib/supabase/find-user-by-email'
import { validateAuditorInviteEligibility } from '@/lib/auditor/auditor-invite-eligibility'

export async function sendDeferredAuditEngagementInvite(params: {
  admin: SupabaseClient
  rawToken: string
  deferred: {
    auditorEmail: string
    existingUserId: string | null
    institutionName: string
    expiresAtIso: string
  }
}): Promise<PendingInviteEmailResult> {
  const { admin, rawToken, deferred } = params
  if (deferred.existingUserId) {
    return sendExistingUserPendingInviteNotification({
      to: deferred.auditorEmail,
      kind: 'audit_engagement',
      contextLabel: deferred.institutionName,
      inviteRawToken: rawToken,
      expiresAtIso: deferred.expiresAtIso,
    })
  }
  return sendPendingInviteEmail({
    to: deferred.auditorEmail,
    kind: 'audit_engagement',
    contextLabel: deferred.institutionName,
    inviteRawToken: rawToken,
    expiresAtIso: deferred.expiresAtIso,
    supabaseAdmin: admin,
  })
}

export type EngagementScope = 'institution_wide' | 'specific_studies'

export type IssueAuditEngagementInput = {
  institutionId: string
  institutionName: string
  auditorEmail: string
  scope: EngagementScope
  purpose: string
  durationDays: number
  studyIds: string[]
  grantedBy: string
  batchId?: string | null
  institutionMetadata?: unknown
  overrideStudyMemberConflict?: boolean
  overrideReason?: string
  /** When true, create the engagement but do not send invite email yet. */
  skipEmail?: boolean
}

export type IssueAuditEngagementResult =
  | {
      ok: true
      engagementId: string
      expiresAt: string
      startsAt: string
      rawToken: string
      email: PendingInviteEmailResult
      /** Present when skipEmail was true — caller must send after letter attach. */
      deferredEmail?: {
        auditorEmail: string
        existingUserId: string | null
        institutionName: string
        expiresAtIso: string
      }
    }
  | { ok: false; status: number; error: string; code?: string; engagement_id?: string }

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

export async function issueAuditEngagement(
  supabase: SupabaseClient,
  admin: SupabaseClient,
  input: IssueAuditEngagementInput
): Promise<IssueAuditEngagementResult> {
  const {
    institutionId,
    institutionName,
    auditorEmail,
    scope,
    purpose,
    durationDays,
    studyIds,
    grantedBy,
    batchId,
    institutionMetadata,
    overrideStudyMemberConflict = false,
    overrideReason = '',
    skipEmail = false,
  } = input

  const emailNorm = normalizeEmail(auditorEmail)

  const eligibility = await validateAuditorInviteEligibility({
    institutionId,
    auditorEmail,
    scope,
    studyIds,
    institutionMetadata,
    supabase,
    admin,
    overrideStudyMemberConflict,
    overrideReason,
  })

  if (!eligibility.ok) {
    return {
      ok: false,
      status: eligibility.status,
      error: eligibility.error,
      code: eligibility.code,
    }
  }

  const { data: existing, error: existingErr } = await supabase
    .from('audit_engagements')
    .select('id, accepted_at, expires_at')
    .eq('institution_id', institutionId)
    .ilike('auditor_email', emailNorm)
    .is('revoked_at', null)

  if (existingErr) {
    return { ok: false, status: 500, error: existingErr.message }
  }

  const now = new Date()
  const expiredOpen = (existing ?? []).filter((r) => new Date(r.expires_at) <= now)
  for (const row of expiredOpen) {
    const revokedAt = now.toISOString()
    const { error: revokeErr } = await supabase
      .from('audit_engagements')
      .update({
        revoked_at: revokedAt,
        revocation_reason: 'expired_superseded',
      })
      .eq('id', row.id)
      .is('revoked_at', null)
    if (revokeErr) {
      return { ok: false, status: 500, error: revokeErr.message }
    }
    const expiredHash = await generateHash({
      engagement_id: row.id,
      institution_id: institutionId,
      reason: 'expired_superseded',
      revoked_at: revokedAt,
    })
    await createAuditEvent(
      null,
      grantedBy,
      'audit_engagement_expired',
      'audit_engagement',
      row.id,
      null,
      expiredHash,
      {
        institution_id: institutionId,
        auditor_email: auditorEmail,
        reason: 'expired_superseded',
        superseded_for_reissue: true,
      }
    )
  }

  const stillOpen = (existing ?? [])
    .filter((r) => !expiredOpen.some((e) => e.id === r.id))
    .find((r) => !r.accepted_at || new Date(r.expires_at) > now)
  if (stillOpen) {
    return {
      ok: false,
      status: 409,
      error: 'An audit engagement for this email already exists. Resend or revoke it first.',
      code: 'duplicate_engagement',
      engagement_id: stillOpen.id,
    }
  }

  const { rawToken, tokenHash } = generateInviteToken()
  const startsAt = new Date()
  const expiresAt = new Date(startsAt.getTime())
  expiresAt.setUTCDate(expiresAt.getUTCDate() + durationDays)

  const { data: inserted, error: insertError } = await supabase
    .from('audit_engagements')
    .insert({
      institution_id: institutionId,
      auditor_email: auditorEmail.trim(),
      scope,
      purpose: purpose.length > 0 ? purpose : null,
      starts_at: startsAt.toISOString(),
      expires_at: expiresAt.toISOString(),
      granted_by: grantedBy,
      token_hash: tokenHash,
      last_sent_at: startsAt.toISOString(),
      resend_count: 0,
      batch_id: batchId ?? null,
    })
    .select('id')
    .single()

  if (insertError || !inserted) {
    return { ok: false, status: 500, error: insertError?.message ?? 'Failed to create engagement' }
  }

  if (scope === 'specific_studies' && studyIds.length > 0) {
    const rows = studyIds.map((sid) => ({ engagement_id: inserted.id, study_id: sid }))
    const { error: linkErr } = await supabase.from('audit_engagement_studies').insert(rows)
    if (linkErr) {
      await supabase
        .from('audit_engagements')
        .update({ revoked_at: new Date().toISOString(), revocation_reason: 'study_link_failed' })
        .eq('id', inserted.id)
      return { ok: false, status: 500, error: linkErr.message }
    }
  }

  const grantedHash = await generateHash({
    engagement_id: inserted.id,
    institution_id: institutionId,
    auditor_email: auditorEmail,
    scope,
    starts_at: startsAt.toISOString(),
    expires_at: expiresAt.toISOString(),
    study_ids: studyIds,
    batch_id: batchId ?? null,
  })
  await createAuditEvent(
    null,
    grantedBy,
    'audit_engagement_granted',
    'audit_engagement',
    inserted.id,
    null,
    grantedHash,
    {
      institution_id: institutionId,
      institution_name: institutionName,
      auditor_email: auditorEmail,
      scope,
      purpose: purpose.length > 0 ? purpose : null,
      duration_days: durationDays,
      study_ids: scope === 'specific_studies' ? studyIds : [],
      batch_id: batchId ?? null,
      study_member_conflict_overridden: eligibility.studyMemberConflictOverridden,
      ...(eligibility.studyMemberConflictOverridden
        ? {
            override_reason: overrideReason.trim(),
            conflicting_study_ids: eligibility.conflictingStudyIds,
          }
        : {}),
    }
  )

  const inviteCreatedHash = await generateHash({
    engagement_id: inserted.id,
    institution_id: institutionId,
    action: 'invite_created',
    kind: 'audit_engagement',
  })
  await createAuditEvent(
    null,
    grantedBy,
    'invite_created',
    'audit_engagement',
    inserted.id,
    null,
    inviteCreatedHash,
    {
      institution_id: institutionId,
      auditor_email: auditorEmail,
      kind: 'audit_engagement',
      scope,
      batch_id: batchId ?? null,
    }
  )

  const existingUserId =
    eligibility.existingUserId ?? (await findUserIdByEmail(admin, auditorEmail.trim()))

  if (skipEmail) {
    return {
      ok: true,
      engagementId: inserted.id,
      expiresAt: expiresAt.toISOString(),
      startsAt: startsAt.toISOString(),
      rawToken,
      email: { sent: false, kind: 'audit_engagement' },
      deferredEmail: {
        auditorEmail: auditorEmail.trim(),
        existingUserId: existingUserId ?? null,
        institutionName,
        expiresAtIso: expiresAt.toISOString(),
      },
    }
  }

  const emailResult = existingUserId
    ? await sendExistingUserPendingInviteNotification({
        to: auditorEmail.trim(),
        kind: 'audit_engagement',
        contextLabel: institutionName,
        inviteRawToken: rawToken,
        expiresAtIso: expiresAt.toISOString(),
      })
    : await sendPendingInviteEmail({
        to: auditorEmail.trim(),
        kind: 'audit_engagement',
        contextLabel: institutionName,
        inviteRawToken: rawToken,
        expiresAtIso: expiresAt.toISOString(),
        supabaseAdmin: admin,
      })

  return {
    ok: true,
    engagementId: inserted.id,
    expiresAt: expiresAt.toISOString(),
    startsAt: startsAt.toISOString(),
    rawToken,
    email: emailResult,
  }
}

export function parseAuditorEmails(body: {
  auditor_email?: unknown
  auditor_emails?: unknown
}): string[] {
  const fromArray = Array.isArray(body.auditor_emails)
    ? (body.auditor_emails as unknown[])
        .filter((e): e is string => typeof e === 'string' && e.trim().length > 0)
        .map((e) => e.trim())
    : []
  const single =
    typeof body.auditor_email === 'string' && body.auditor_email.trim()
      ? [body.auditor_email.trim()]
      : []
  const combined = [...fromArray, ...single]
  const seen = new Set<string>()
  const out: string[] = []
  for (const email of combined) {
    const norm = normalizeEmail(email)
    if (seen.has(norm)) continue
    seen.add(norm)
    out.push(email)
  }
  return out
}
