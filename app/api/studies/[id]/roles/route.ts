import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { canManageStudyMembers } from '@/lib/supabase/permissions'
import { SYSTEM_ROLE_SLUGS } from '@/lib/supabase/study-roles'
import { createAuditEvent } from '@/lib/supabase/audit'
import { generateHash } from '@/lib/crypto'
import { assertStudyIsActive } from '@/lib/supabase/study-status'

const SLUG_RE = /^[a-z][a-z0-9-]{0,62}$/

function asBool(v: unknown): boolean {
  return v === true
}

const FLAG_KEYS = [
  'can_view',
  'can_comment',
  'can_review',
  'can_approve',
  'can_share',
  'can_manage_members',
  'can_edit_study_settings',
  'can_create_records',
  'can_moderate_record_status',
  'can_anchor_records',
  'can_access_audit_hub',
] as const

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: studyId } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const allowed = await canManageStudyMembers(user.id, studyId)
  if (!allowed) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { data, error } = await supabase
    .from('study_role_definitions')
    .select('*')
    .eq('study_id', studyId)
    .order('sort_order', { ascending: true })
    .order('display_name', { ascending: true })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ roles: data ?? [] })
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: studyId } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const allowed = await canManageStudyMembers(user.id, studyId)
  if (!allowed) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const activeCheck = await assertStudyIsActive(supabase, studyId)
  if (!activeCheck.ok) {
    return NextResponse.json({ error: activeCheck.error }, { status: 403 })
  }

  const body = await request.json().catch(() => ({}))
  const slug =
    typeof body.slug === 'string' ? body.slug.trim().toLowerCase() : ''
  const display_name =
    typeof body.display_name === 'string' ? body.display_name.trim() : ''

  if (!slug || !display_name) {
    return NextResponse.json(
      { error: 'slug and display_name are required' },
      { status: 400 }
    )
  }
  if (!SLUG_RE.test(slug)) {
    return NextResponse.json(
      {
        error:
          'slug must be lowercase letters, digits, or hyphens, starting with a letter',
      },
      { status: 400 }
    )
  }
  if ((SYSTEM_ROLE_SLUGS as readonly string[]).includes(slug)) {
    return NextResponse.json(
      { error: 'That slug is reserved for a built-in role' },
      { status: 400 }
    )
  }

  const { data: maxRow } = await supabase
    .from('study_role_definitions')
    .select('sort_order')
    .eq('study_id', studyId)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle()

  const sortOrder = (maxRow?.sort_order ?? 0) + 1

  const row = {
    study_id: studyId,
    slug,
    display_name,
    is_system: false,
    sort_order: sortOrder,
    can_view: asBool(body.can_view),
    can_comment: asBool(body.can_comment),
    can_review: asBool(body.can_review),
    can_approve: asBool(body.can_approve),
    can_share: asBool(body.can_share),
    can_manage_members: asBool(body.can_manage_members),
    can_edit_study_settings: asBool(body.can_edit_study_settings),
    can_create_records: asBool(body.can_create_records),
    can_moderate_record_status: asBool(body.can_moderate_record_status),
    can_anchor_records: asBool(body.can_anchor_records),
    can_access_audit_hub: asBool(body.can_access_audit_hub),
  }

  const { data: inserted, error } = await supabase
    .from('study_role_definitions')
    .insert(row)
    .select('id')
    .single()

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json(
        { error: 'A role with this slug already exists' },
        { status: 409 }
      )
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const newHash = await generateHash({
    study_id: studyId,
    role_definition_id: inserted.id,
    action: 'custom_role_created',
  })
  await createAuditEvent(
    studyId,
    user.id,
    'study_updated',
    'study_role_definition',
    inserted.id,
    null,
    newHash,
    {
      field: 'study_role_definition',
      action: 'created',
      slug,
      display_name,
      effective_flags: {
        can_view: row.can_view,
        can_comment: row.can_comment,
        can_review: row.can_review,
        can_approve: row.can_approve,
        can_share: row.can_share,
        can_manage_members: row.can_manage_members,
        can_edit_study_settings: row.can_edit_study_settings,
        can_create_records: row.can_create_records,
        can_moderate_record_status: row.can_moderate_record_status,
        can_anchor_records: row.can_anchor_records,
        can_access_audit_hub: row.can_access_audit_hub,
      },
    }
  )

  return NextResponse.json({ success: true, id: inserted.id })
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: studyId } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const allowed = await canManageStudyMembers(user.id, studyId)
  if (!allowed) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const activeCheck = await assertStudyIsActive(supabase, studyId)
  if (!activeCheck.ok) {
    return NextResponse.json({ error: activeCheck.error }, { status: 403 })
  }

  const body = await request.json().catch(() => ({}))
  const defId = typeof body.id === 'string' ? body.id.trim() : ''
  if (!defId) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 })
  }

  const { data: existing, error: fetchErr } = await supabase
    .from('study_role_definitions')
    .select('*')
    .eq('id', defId)
    .eq('study_id', studyId)
    .single()

  if (fetchErr || !existing) {
    return NextResponse.json({ error: 'Role not found' }, { status: 404 })
  }
  if (existing.is_system) {
    return NextResponse.json(
      { error: 'Built-in roles cannot be edited here' },
      { status: 400 }
    )
  }

  const updates: Record<string, unknown> = {}
  if (typeof body.display_name === 'string' && body.display_name.trim() !== '') {
    updates.display_name = body.display_name.trim()
  }
  for (const k of FLAG_KEYS) {
    if (Object.prototype.hasOwnProperty.call(body, k)) {
      updates[k] = asBool(body[k])
    }
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
  }

  const previousHash = await generateHash({
    study_id: studyId,
    role_definition_id: defId,
    snapshot: existing,
  })

  const { error: upErr } = await supabase
    .from('study_role_definitions')
    .update(updates)
    .eq('id', defId)
    .eq('study_id', studyId)

  if (upErr) {
    return NextResponse.json({ error: upErr.message }, { status: 500 })
  }

  const { data: nextRow, error: reErr } = await supabase
    .from('study_role_definitions')
    .select('*')
    .eq('id', defId)
    .single()

  if (reErr || !nextRow) {
    return NextResponse.json({ error: reErr?.message ?? 'Reload failed' }, { status: 500 })
  }

  const newHash = await generateHash({
    study_id: studyId,
    role_definition_id: defId,
    snapshot: nextRow,
  })

  await createAuditEvent(
    studyId,
    user.id,
    'study_updated',
    'study_role_definition',
    defId,
    previousHash,
    newHash,
    {
      field: 'study_role_definition',
      action: 'updated',
      slug: nextRow.slug,
      display_name: nextRow.display_name,
      updated_keys: Object.keys(updates),
      effective_flags_after: {
        can_view: nextRow.can_view,
        can_comment: nextRow.can_comment,
        can_review: nextRow.can_review,
        can_approve: nextRow.can_approve,
        can_share: nextRow.can_share,
        can_manage_members: nextRow.can_manage_members,
        can_edit_study_settings: nextRow.can_edit_study_settings,
        can_create_records: nextRow.can_create_records,
        can_moderate_record_status: nextRow.can_moderate_record_status,
        can_anchor_records: nextRow.can_anchor_records,
        can_access_audit_hub: nextRow.can_access_audit_hub,
      },
    }
  )

  return NextResponse.json({ success: true, role: nextRow })
}
