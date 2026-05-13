// Institution-admin endpoints for auditor engagements.
// Reuses the same hashed-token / pending-invite pattern as institution invites so the
// existing `/invite/[token]` resolver and email dispatch flow handle auditor invites.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { canManageInstitution } from '@/lib/supabase/permissions'
import { createAuditEvent } from '@/lib/supabase/audit'
import { generateHash } from '@/lib/crypto'
import { generateInviteToken } from '@/lib/invites/token'
import {
  inviteEmailDispatchFields,
  sendPendingInviteEmail,
} from '@/lib/email/pending-invite-notification'

type EngagementScope = 'institution_wide' | 'specific_studies'

const MIN_DURATION_DAYS = 1
const MAX_DURATION_DAYS = 365
const DEFAULT_DURATION_DAYS = 30

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

function clampDurationDays(raw: unknown): number {
  const n = Number(raw)
  if (!Number.isFinite(n)) return DEFAULT_DURATION_DAYS
  return Math.min(MAX_DURATION_DAYS, Math.max(MIN_DURATION_DAYS, Math.floor(n)))
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: institutionId } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const allowed = await canManageInstitution(user.id, institutionId)
  if (!allowed) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { data: rows, error } = await supabase
    .from('audit_engagements')
    .select(
      `id, auditor_email, auditor_user_id, scope, purpose,
       starts_at, expires_at, accepted_at, revoked_at, revocation_reason,
       granted_by, last_sent_at, resend_count, invite_first_opened_at, created_at`
    )
    .eq('institution_id', institutionId)
    .order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const ids = (rows ?? []).map((r) => r.id)
  const { data: scopedStudies } = ids.length
    ? await supabase
        .from('audit_engagement_studies')
        .select(`engagement_id, study_id, study:studies(id, title)`)
        .in('engagement_id', ids)
    : { data: [] as Array<{
        engagement_id: string
        study_id: string
        study: { id: string; title: string } | { id: string; title: string }[] | null
      }> }

  const studiesByEngagement = new Map<string, { study_id: string; title: string | null }[]>()
  for (const row of scopedStudies ?? []) {
    const raw = row.study as
      | { id: string; title: string }
      | { id: string; title: string }[]
      | null
    const study = Array.isArray(raw) ? raw[0] ?? null : raw
    const list = studiesByEngagement.get(row.engagement_id) ?? []
    list.push({ study_id: row.study_id, title: study?.title ?? null })
    studiesByEngagement.set(row.engagement_id, list)
  }

  // Optional: resolve auditor user emails (covers cases where the user record was created
  // before / after the invite). Email on the engagement row is the canonical invite address.
  const admin = createAdminClient()
  const acceptedUserEmails: Record<string, string> = {}
  for (const r of rows ?? []) {
    if (!r.auditor_user_id) continue
    if (acceptedUserEmails[r.auditor_user_id]) continue
    try {
      const { data } = await admin.auth.admin.getUserById(r.auditor_user_id)
      if (data.user?.email) {
        acceptedUserEmails[r.auditor_user_id] = data.user.email
      }
    } catch {
      /* ignore lookup errors */
    }
  }

  return NextResponse.json({
    engagements: (rows ?? []).map((r) => ({
      ...r,
      studies: studiesByEngagement.get(r.id) ?? [],
      auditor_user_email: r.auditor_user_id
        ? acceptedUserEmails[r.auditor_user_id] ?? null
        : null,
    })),
  })
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: institutionId } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const allowed = await canManageInstitution(user.id, institutionId)
  if (!allowed) {
    return NextResponse.json(
      { error: 'You do not have permission to issue audit engagements for this institution' },
      { status: 403 }
    )
  }

  const { data: institution } = await supabase
    .from('institutions')
    .select('id, name')
    .eq('id', institutionId)
    .single()
  if (!institution) {
    return NextResponse.json({ error: 'Institution not found' }, { status: 404 })
  }

  const body = await request.json().catch(() => ({}))
  const auditorEmail = typeof body.auditor_email === 'string' ? body.auditor_email.trim() : ''
  const scope = body.scope as EngagementScope | undefined
  const purpose = typeof body.purpose === 'string' ? body.purpose.trim() : ''
  const durationDays = clampDurationDays(body.duration_days)
  const studyIds = Array.isArray(body.study_ids) ? (body.study_ids as unknown[]) : []

  if (!auditorEmail) {
    return NextResponse.json({ error: 'auditor_email is required' }, { status: 400 })
  }
  if (scope !== 'institution_wide' && scope !== 'specific_studies') {
    return NextResponse.json({ error: 'scope must be institution_wide or specific_studies' }, { status: 400 })
  }
  if (scope === 'specific_studies' && studyIds.length === 0) {
    return NextResponse.json(
      { error: 'At least one study is required when scope is specific_studies' },
      { status: 400 }
    )
  }

  const cleanStudyIds = [
    ...new Set(studyIds.filter((s): s is string => typeof s === 'string' && s.length > 0)),
  ]
  if (scope === 'specific_studies') {
    const { data: matched, error: studyErr } = await supabase
      .from('studies')
      .select('id')
      .eq('institution_id', institutionId)
      .in('id', cleanStudyIds)
    if (studyErr) {
      return NextResponse.json({ error: studyErr.message }, { status: 500 })
    }
    const matchedIds = new Set((matched ?? []).map((m) => m.id))
    const invalid = cleanStudyIds.filter((s) => !matchedIds.has(s))
    if (invalid.length > 0) {
      return NextResponse.json(
        { error: 'One or more studies are not under this institution', invalid_study_ids: invalid },
        { status: 400 }
      )
    }
  }

  const { rawToken, tokenHash } = generateInviteToken()
  const startsAt = new Date()
  const expiresAt = new Date(startsAt.getTime())
  expiresAt.setUTCDate(expiresAt.getUTCDate() + durationDays)

  // Reject if a non-revoked engagement for this email already exists (one open invite per
  // (institution, email) — the partial unique index also enforces this in DB).
  const emailNorm = normalizeEmail(auditorEmail)
  const { data: existing } = await supabase
    .from('audit_engagements')
    .select('id, accepted_at, expires_at')
    .eq('institution_id', institutionId)
    .ilike('auditor_email', emailNorm)
    .is('revoked_at', null)
  const open = (existing ?? []).find((r) => !r.accepted_at || new Date(r.expires_at) > new Date())
  if (open) {
    return NextResponse.json(
      {
        error: 'An audit engagement for this email already exists. Resend or revoke it first.',
        code: 'duplicate_engagement',
        engagement_id: open.id,
      },
      { status: 409 }
    )
  }

  const { data: inserted, error: insertError } = await supabase
    .from('audit_engagements')
    .insert({
      institution_id: institutionId,
      auditor_email: auditorEmail,
      scope,
      purpose: purpose.length > 0 ? purpose : null,
      starts_at: startsAt.toISOString(),
      expires_at: expiresAt.toISOString(),
      granted_by: user.id,
      token_hash: tokenHash,
      last_sent_at: startsAt.toISOString(),
      resend_count: 0,
    })
    .select('id')
    .single()

  if (insertError || !inserted) {
    return NextResponse.json({ error: insertError?.message ?? 'Failed to create engagement' }, { status: 500 })
  }

  if (scope === 'specific_studies' && cleanStudyIds.length > 0) {
    const rows = cleanStudyIds.map((sid) => ({ engagement_id: inserted.id, study_id: sid }))
    const { error: linkErr } = await supabase.from('audit_engagement_studies').insert(rows)
    if (linkErr) {
      // Best effort cleanup: revoke the engagement so we don't leave a half-set up grant.
      await supabase
        .from('audit_engagements')
        .update({ revoked_at: new Date().toISOString(), revocation_reason: 'study_link_failed' })
        .eq('id', inserted.id)
      return NextResponse.json({ error: linkErr.message }, { status: 500 })
    }
  }

  const grantedHash = await generateHash({
    engagement_id: inserted.id,
    institution_id: institutionId,
    auditor_email: auditorEmail,
    scope,
    starts_at: startsAt.toISOString(),
    expires_at: expiresAt.toISOString(),
    study_ids: cleanStudyIds,
  })
  await createAuditEvent(
    null,
    user.id,
    'audit_engagement_granted',
    'audit_engagement',
    inserted.id,
    null,
    grantedHash,
    {
      institution_id: institutionId,
      institution_name: institution.name,
      auditor_email: auditorEmail,
      scope,
      purpose: purpose.length > 0 ? purpose : null,
      duration_days: durationDays,
      study_ids: scope === 'specific_studies' ? cleanStudyIds : [],
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
    user.id,
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
    }
  )

  const admin = createAdminClient()
  const emailResult = await sendPendingInviteEmail({
    to: auditorEmail,
    kind: 'institution',
    contextLabel: `${institution.name} (audit engagement)`,
    inviteRawToken: rawToken,
    expiresAtIso: expiresAt.toISOString(),
    supabaseAdmin: admin,
  })

  return NextResponse.json({
    success: true,
    engagement_id: inserted.id,
    expires_at: expiresAt.toISOString(),
    starts_at: startsAt.toISOString(),
    ...inviteEmailDispatchFields(emailResult),
  })
}
