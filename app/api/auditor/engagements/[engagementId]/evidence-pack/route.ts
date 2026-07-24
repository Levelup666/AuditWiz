// Read-only evidence pack for a single engagement.
// Auditors call this to download a self-contained, hash-stamped JSON manifest
// that demonstrates the records, signatures, anchors, and audit trail they reviewed.
//
// Authorization model:
//  * Engagement must be active (audit_engagement_is_active server-side helper)
//  * RLS additionally enforces that the auditor can SELECT the underlying rows.
//
// Every export emits an `audit_engagement_export` event, so the audit ledger has
// a permanent record of what evidence was pulled and when.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { generateHash } from '@/lib/crypto'
import { createAuditEvent } from '@/lib/supabase/audit'
import { listAuditEventsPage } from '@/lib/supabase/audit'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ engagementId: string }> }
) {
  const { engagementId } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // RLS: only the engagement owner can SELECT this row.
  const { data: engagement, error: engErr } = await supabase
    .from('audit_engagements')
    .select(
      `id, institution_id, scope, purpose, starts_at, expires_at, accepted_at, revoked_at,
       auditor_organization_name, auditor_title, auditor_reference_id, attested_at,
       attestation_text_hash,
       institution:institutions(id, name)`
    )
    .eq('id', engagementId)
    .single()

  if (engErr || !engagement) {
    return NextResponse.json({ error: 'Engagement not found' }, { status: 404 })
  }
  const now = new Date()
  if (
    engagement.revoked_at ||
    !engagement.accepted_at ||
    new Date(engagement.expires_at) <= now ||
    new Date(engagement.starts_at) > now
  ) {
    return NextResponse.json(
      { error: 'Engagement is not currently active.' },
      { status: 403 }
    )
  }

  const { data: rawStudyIds, error: rpcErr } = await supabase.rpc(
    'audit_engagement_study_ids_for_user'
  )
  if (rpcErr) {
    return NextResponse.json({ error: rpcErr.message }, { status: 500 })
  }

  const allStudyIds: string[] = [...new Set(((rawStudyIds ?? []) as string[]).filter(Boolean))]

  // Limit to studies covered by this engagement (institution_wide => all institution studies; specific_studies => engagement_studies)
  let scopedStudyIds: string[] = []
  if (engagement.scope === 'institution_wide') {
    const { data: instStudies } = await supabase
      .from('studies')
      .select('id, title, status, institution_id, created_at, updated_at')
      .eq('institution_id', engagement.institution_id)
    scopedStudyIds = (instStudies ?? [])
      .map((s) => s.id)
      .filter((id) => allStudyIds.includes(id))
  } else {
    const { data: link } = await supabase
      .from('audit_engagement_studies')
      .select('study_id')
      .eq('engagement_id', engagement.id)
    scopedStudyIds = (link ?? [])
      .map((r) => r.study_id)
      .filter((id) => allStudyIds.includes(id))
  }

  const { data: studies } = scopedStudyIds.length
    ? await supabase
        .from('studies')
        .select('id, title, status, institution_id, created_at, updated_at, description')
        .in('id', scopedStudyIds)
    : { data: [] as Array<{
        id: string
        title: string
        status: string
        institution_id: string | null
        created_at: string
        updated_at: string
        description: string | null
      }> }

  // Records covered by these studies (RLS-allowed)
  const { data: records } = scopedStudyIds.length
    ? await supabase
        .from('records')
        .select(
          `id, study_id, record_number, version, status, content_hash, created_at,
           amendment_reason, created_by`
        )
        .in('study_id', scopedStudyIds)
        .order('study_id', { ascending: true })
        .order('record_number', { ascending: true })
        .order('version', { ascending: true })
    : { data: [] as Array<Record<string, unknown>> }

  const recordIds = (records ?? []).map((r) => r.id as string)

  const { data: signatures } = recordIds.length
    ? await supabase
        .from('signatures')
        .select(
          'id, record_id, record_version, signer_id, intent, signature_hash, signed_at'
        )
        .in('record_id', recordIds)
    : { data: [] as Array<Record<string, unknown>> }

  const { data: anchors } = recordIds.length
    ? await supabase
        .from('blockchain_anchors')
        .select(
          'id, record_id, record_version, content_hash, transaction_hash, block_number, anchored_at'
        )
        .in('record_id', recordIds)
    : { data: [] as Array<Record<string, unknown>> }

  // Pull a bounded slice of audit events for the studies in scope. Use the existing keyset
  // function so we honor RLS + cutoff. Cap at 5000 lines; auditors who need more can re-run.
  const auditEvents: Record<string, unknown>[] = []
  if (scopedStudyIds.length > 0) {
    let cursor: { timestamp: string; id: string } | null = null
    for (let page = 0; page < 50; page++) {
      const { events, nextCursor } = await listAuditEventsPage({
        studyIds: scopedStudyIds,
        cursor,
        limit: 100,
      })
      auditEvents.push(...events)
      if (auditEvents.length >= 5000) break
      if (!nextCursor) break
      cursor = nextCursor
    }
  }

  const generatedAt = new Date().toISOString()
  const payload = {
    generated_at: generatedAt,
    engagement: {
      id: engagement.id,
      institution_id: engagement.institution_id,
      institution_name:
        Array.isArray(engagement.institution)
          ? engagement.institution[0]?.name ?? null
          : (engagement.institution as { name?: string } | null)?.name ?? null,
      scope: engagement.scope,
      purpose: engagement.purpose,
      starts_at: engagement.starts_at,
      expires_at: engagement.expires_at,
      auditor_credentials: {
        organization_name: engagement.auditor_organization_name ?? null,
        title: engagement.auditor_title ?? null,
        reference_id: engagement.auditor_reference_id ?? null,
        attested_at: engagement.attested_at ?? null,
        attestation_text_hash: engagement.attestation_text_hash ?? null,
      },
    },
    studies: studies ?? [],
    records: records ?? [],
    signatures: signatures ?? [],
    blockchain_anchors: anchors ?? [],
    audit_events: auditEvents,
    truncation: {
      audit_events_capped_at: 5000,
      audit_events_truncated: auditEvents.length >= 5000,
    },
  }

  const manifestHash = await generateHash({
    generated_at: payload.generated_at,
    engagement_id: payload.engagement.id,
    counts: {
      studies: payload.studies.length,
      records: payload.records.length,
      signatures: payload.signatures.length,
      anchors: payload.blockchain_anchors.length,
      audit_events: payload.audit_events.length,
    },
  })

  await createAuditEvent(
    null,
    user.id,
    'audit_engagement_export',
    'audit_engagement',
    engagement.id,
    null,
    manifestHash,
    {
      institution_id: engagement.institution_id,
      scope: engagement.scope,
      study_ids: scopedStudyIds,
      counts: {
        studies: payload.studies.length,
        records: payload.records.length,
        signatures: payload.signatures.length,
        anchors: payload.blockchain_anchors.length,
        audit_events: payload.audit_events.length,
      },
    }
  )

  const url = new URL(request.url)
  const format = url.searchParams.get('format')

  const finalPayload = {
    ...payload,
    manifest_hash: manifestHash,
  }

  if (format === 'download') {
    return new NextResponse(JSON.stringify(finalPayload, null, 2), {
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="audit-engagement-${engagement.id}-${generatedAt.slice(0, 10)}.json"`,
      },
    })
  }

  return NextResponse.json(finalPayload)
}
