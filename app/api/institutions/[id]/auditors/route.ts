// Institution-admin endpoints for auditor engagements.
// Reuses the same hashed-token / pending-invite pattern as institution invites so the
// existing `/invite/[token]` resolver and email dispatch flow handle auditor invites.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { canManageInstitution } from '@/lib/supabase/permissions'
import { inviteEmailDispatchFields, type PendingInviteEmailResult } from '@/lib/email/pending-invite-notification'
import {
  issueAuditEngagement,
  parseAuditorEmails,
  sendDeferredAuditEngagementInvite,
  type EngagementScope,
} from '@/lib/auditor/issue-audit-engagement'
import { attachEngagementLetter } from '@/lib/auditor/attach-engagement-letter'

const MIN_DURATION_DAYS = 1
const MAX_DURATION_DAYS = 365
const DEFAULT_DURATION_DAYS = 30

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
      `id, auditor_email, auditor_user_id, scope, purpose, batch_id,
       starts_at, expires_at, accepted_at, revoked_at, revocation_reason,
       granted_by, last_sent_at, resend_count, invite_first_opened_at, created_at,
       engagement_letter_file_name, engagement_letter_file_hash, engagement_letter_uploaded_at,
       coi_has_conflict, coi_declared_at`
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
    .select('id, name, metadata')
    .eq('id', institutionId)
    .single()
  if (!institution) {
    return NextResponse.json({ error: 'Institution not found' }, { status: 404 })
  }

  const contentType = request.headers.get('content-type') ?? ''
  let auditorEmails: string[] = []
  let scope: EngagementScope | undefined
  let purpose = ''
  let durationDays = DEFAULT_DURATION_DAYS
  let studyIds: unknown[] = []
  let overrideStudyMemberConflict = false
  let overrideReason = ''
  let letterFile: File | null = null

  if (contentType.includes('multipart/form-data')) {
    const form = await request.formData()
    const emailsRaw = form.get('auditor_emails')
    const emailsText = typeof emailsRaw === 'string' ? emailsRaw : ''
    auditorEmails = parseAuditorEmails({
      auditor_emails: emailsText
        .split(/[\n,;]+/)
        .map((e) => e.trim())
        .filter(Boolean),
      auditor_email:
        typeof form.get('auditor_email') === 'string'
          ? (form.get('auditor_email') as string)
          : undefined,
    })
    scope = form.get('scope') as EngagementScope | undefined
    purpose = typeof form.get('purpose') === 'string' ? String(form.get('purpose')).trim() : ''
    durationDays = clampDurationDays(form.get('duration_days'))
    const studyRaw = form.get('study_ids')
    if (typeof studyRaw === 'string' && studyRaw.trim()) {
      try {
        const parsed = JSON.parse(studyRaw) as unknown
        studyIds = Array.isArray(parsed) ? parsed : []
      } catch {
        studyIds = []
      }
    }
    overrideStudyMemberConflict =
      form.get('override_study_member_conflict') === 'true' ||
      form.get('override_study_member_conflict') === 'on'
    overrideReason =
      typeof form.get('override_reason') === 'string'
        ? String(form.get('override_reason')).trim()
        : ''
    const file = form.get('file')
    letterFile = file instanceof File && file.size > 0 ? file : null
  } else {
    const body = await request.json().catch(() => ({}))
    auditorEmails = parseAuditorEmails(body)
    scope = body.scope as EngagementScope | undefined
    purpose = typeof body.purpose === 'string' ? body.purpose.trim() : ''
    durationDays = clampDurationDays(body.duration_days)
    studyIds = Array.isArray(body.study_ids) ? (body.study_ids as unknown[]) : []
    overrideStudyMemberConflict =
      body.override_study_member_conflict === true ||
      body.override_study_member_conflict === 'true'
    overrideReason =
      typeof body.override_reason === 'string' ? body.override_reason.trim() : ''
  }

  if (!letterFile) {
    return NextResponse.json(
      {
        error: 'Engagement letter PDF is required when issuing an audit engagement.',
        code: 'letter_required',
      },
      { status: 400 }
    )
  }

  if (auditorEmails.length === 0) {
    return NextResponse.json({ error: 'auditor_email or auditor_emails is required' }, { status: 400 })
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

  const batchId = crypto.randomUUID()
  const admin = createAdminClient()
  const letterBuffer = Buffer.from(await letterFile.arrayBuffer())
  const letterMeta = {
    name: letterFile.name,
    type: letterFile.type || 'application/pdf',
    size: letterFile.size,
    buffer: letterBuffer,
  }

  const created: Array<{
    engagement_id: string
    auditor_email: string
    expires_at: string
    emailResult: PendingInviteEmailResult
  }> = []
  const skipped: Array<{ auditor_email: string; error: string; code?: string }> = []

  for (const auditorEmail of auditorEmails) {
    const result = await issueAuditEngagement(supabase, admin, {
      institutionId,
      institutionName: institution.name,
      auditorEmail,
      scope,
      purpose,
      durationDays,
      studyIds: cleanStudyIds,
      grantedBy: user.id,
      batchId: auditorEmails.length > 1 ? batchId : null,
      institutionMetadata: institution.metadata,
      overrideStudyMemberConflict,
      overrideReason,
      skipEmail: true,
    })

    if (!result.ok) {
      skipped.push({
        auditor_email: auditorEmail,
        error: result.error,
        code: result.code,
      })
      continue
    }

    const attached = await attachEngagementLetter({
      supabase,
      admin,
      institutionId,
      engagementId: result.engagementId,
      uploadedBy: user.id,
      file: letterMeta,
    })

    if (!attached.ok) {
      await supabase
        .from('audit_engagements')
        .update({
          revoked_at: new Date().toISOString(),
          revocation_reason: 'letter_attach_failed',
        })
        .eq('id', result.engagementId)
      skipped.push({
        auditor_email: auditorEmail,
        error: attached.error,
        code: attached.code ?? 'letter_attach_failed',
      })
      continue
    }

    const emailResult = result.deferredEmail
      ? await sendDeferredAuditEngagementInvite({
          admin,
          rawToken: result.rawToken,
          deferred: result.deferredEmail,
        })
      : result.email

    created.push({
      engagement_id: result.engagementId,
      auditor_email: auditorEmail,
      expires_at: result.expiresAt,
      emailResult,
    })
  }

  if (created.length === 0) {
    const first = skipped[0]
    const status =
      first?.code === 'duplicate_engagement' || first?.code === 'study_member_conflict'
        ? 409
        : first?.code === 'institution_member_conflict' ||
            first?.code === 'existing_account_not_allowed'
          ? 403
          : first?.code === 'letter_required'
            ? 400
            : 500
    return NextResponse.json(
      {
        error: first?.error ?? 'Failed to create engagements',
        code: first?.code,
        skipped,
      },
      { status }
    )
  }

  const firstCreated = created[0]
  const dispatchFields = inviteEmailDispatchFields(firstCreated.emailResult)

  return NextResponse.json({
    success: true,
    batch_id: auditorEmails.length > 1 ? batchId : null,
    created: created.map((c) => ({
      engagement_id: c.engagement_id,
      auditor_email: c.auditor_email,
      expires_at: c.expires_at,
      email_dispatched: inviteEmailDispatchFields(c.emailResult).email_dispatched,
    })),
    skipped,
    engagement_id: firstCreated.engagement_id,
    expires_at: firstCreated.expires_at,
    ...dispatchFields,
    email_dispatch_message:
      created.length > 1
        ? `Created ${created.length} audit engagements.${skipped.length ? ` ${skipped.length} skipped.` : ''}`
        : dispatchFields.email_dispatch_message,
  })
}
