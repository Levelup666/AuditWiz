import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { canManageInstitution } from '@/lib/supabase/permissions'
import { createAuditEvent } from '@/lib/supabase/audit'
import { generateHash } from '@/lib/crypto'
import {
  INSTITUTION_REVOKE,
  validateInstitutionMemberRevocation,
} from '@/lib/supabase/member-revocation'
import { resolveMemberDisplayName } from '@/lib/profile/resolve-member-display'
import { institutionAllowsExternalCollaborators } from '@/lib/institution-collaboration'
import {
  getInstitutionMemberRemovalImpact,
  revokeStudyAccessForRemovedInstitutionMember,
} from '@/lib/institution-member-removal-cascade'

export async function GET(
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
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { data: members, error } = await supabase
    .from('institution_members')
    .select('id, user_id, role, granted_at, granted_by')
    .eq('institution_id', institutionId)
    .is('revoked_at', null)
    .order('granted_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const admin = createAdminClient()
  const emails: Record<string, string> = {}
  const metadataByUser: Record<string, Record<string, unknown> | undefined> = {}
  for (const m of members || []) {
    try {
      const { data: u } = await admin.auth.admin.getUserById(m.user_id)
      if (u?.user?.email) emails[m.user_id] = u.user.email
      metadataByUser[m.user_id] = u?.user?.user_metadata as Record<string, unknown> | undefined
    } catch {
      // Keep the email field reserved for real auth emails; never expose UUID fallbacks here.
    }
  }

  const userIds = [...new Set((members ?? []).map((m) => m.user_id))]
  const { data: profileRows } =
    userIds.length > 0
      ? await admin
          .from('profiles')
          .select('id, first_name, last_name, nickname, display_name')
          .in('id', userIds)
      : { data: null as null }

  const profileByUser = new Map((profileRows ?? []).map((p) => [p.id, p]))

  const withEmails = (members || []).map((m) => {
    const realEmail = emails[m.user_id]
    const prof = profileByUser.get(m.user_id)
    const member_display_name = resolveMemberDisplayName(
      prof,
      metadataByUser[m.user_id],
      realEmail
    )
    return {
      ...m,
      email: realEmail ?? 'Email unavailable',
      member_display_name,
    }
  })

  const { data: instRow } = await supabase
    .from('institutions')
    .select('metadata')
    .eq('id', institutionId)
    .maybeSingle()

  return NextResponse.json({
    members: withEmails,
    allow_external_collaborators: institutionAllowsExternalCollaborators(instRow?.metadata ?? null),
  })
}

export async function PATCH(
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
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json().catch(() => ({}))
  const { memberId, revoked, role, confirmStudyAccessRevocation } = body as {
    memberId?: string
    revoked?: boolean
    role?: string
    confirmStudyAccessRevocation?: boolean
  }

  const nextRole =
    typeof role === 'string' && (role === 'admin' || role === 'member')
      ? role
      : null

  if (!memberId || (revoked !== true && !nextRole)) {
    return NextResponse.json(
      { error: 'memberId and either revoked: true or role required' },
      { status: 400 }
    )
  }

  const { data: member, error: fetchError } = await supabase
    .from('institution_members')
    .select('id, user_id, role')
    .eq('id', memberId)
    .eq('institution_id', institutionId)
    .is('revoked_at', null)
    .single()

  if (fetchError || !member) {
    return NextResponse.json({ error: 'Member not found' }, { status: 404 })
  }

  if (nextRole) {
    if (member.role === nextRole) {
      return NextResponse.json({ success: true, unchanged: true })
    }
    if (member.user_id === user.id) {
      return NextResponse.json({ error: INSTITUTION_REVOKE.self }, { status: 403 })
    }
    if (member.role === 'admin' && nextRole !== 'admin') {
      const { count: adminCount, error: adminErr } = await supabase
        .from('institution_members')
        .select('*', { count: 'exact', head: true })
        .eq('institution_id', institutionId)
        .is('revoked_at', null)
        .eq('role', 'admin')

      if (adminErr) {
        return NextResponse.json({ error: adminErr.message }, { status: 500 })
      }
      if ((adminCount ?? 0) <= 1) {
        return NextResponse.json({ error: INSTITUTION_REVOKE.lastAdmin }, { status: 403 })
      }
    }

    const { error: roleUpdateError } = await supabase
      .from('institution_members')
      .update({ role: nextRole })
      .eq('id', memberId)
      .eq('institution_id', institutionId)
      .is('revoked_at', null)

    if (roleUpdateError) {
      return NextResponse.json({ error: roleUpdateError.message }, { status: 500 })
    }

    const stateHash = await generateHash({
      institution_id: institutionId,
      user_id: member.user_id,
      previous_role: member.role,
      next_role: nextRole,
      changed_by: user.id,
    })

    await createAuditEvent(
      null,
      user.id,
      'institution_member_role_changed',
      'institution_member',
      member.user_id,
      null,
      stateHash,
      { institution_id: institutionId, previous_role: member.role, next_role: nextRole }
    )

    return NextResponse.json({ success: true })
  }

  const { count: memberCount, error: countErr } = await supabase
    .from('institution_members')
    .select('*', { count: 'exact', head: true })
    .eq('institution_id', institutionId)
    .is('revoked_at', null)

  const { count: adminCount, error: adminErr } = await supabase
    .from('institution_members')
    .select('*', { count: 'exact', head: true })
    .eq('institution_id', institutionId)
    .is('revoked_at', null)
    .eq('role', 'admin')

  if (countErr || adminErr) {
    return NextResponse.json(
      { error: countErr?.message ?? adminErr?.message ?? 'Count failed' },
      { status: 500 }
    )
  }

  const decision = validateInstitutionMemberRevocation({
    actorId: user.id,
    targetUserId: member.user_id,
    targetRole: member.role,
    activeMemberCount: memberCount ?? 0,
    activeAdminCount: adminCount ?? 0,
  })

  if (!decision.ok) {
    return NextResponse.json({ error: decision.message }, { status: 403 })
  }

  const admin = createAdminClient()
  const { data: instMeta } = await supabase
    .from('institutions')
    .select('metadata')
    .eq('id', institutionId)
    .maybeSingle()
  const institutionRequiresMembersOnlyOnStudies = !institutionAllowsExternalCollaborators(
    instMeta?.metadata ?? null
  )

  if (institutionRequiresMembersOnlyOnStudies) {
    const impact = await getInstitutionMemberRemovalImpact(admin, institutionId, member.user_id)
    const needsConfirm = impact.studies.length > 0 || impact.openTaskAssigneeCount > 0
    if (needsConfirm && !confirmStudyAccessRevocation) {
      return NextResponse.json(
        {
          error:
            'Removing this person from the institution will revoke their access to draft or active studies under this institution and remove them from open tasks they were assigned. Confirm to proceed.',
          code: 'study_access_revocation_required',
          impact,
        },
        { status: 409 }
      )
    }

    const cascade = await revokeStudyAccessForRemovedInstitutionMember({
      admin,
      actorUserId: user.id,
      institutionId,
      targetUserId: member.user_id,
    })
    if (!cascade.ok) {
      return NextResponse.json({ error: cascade.message }, { status: 500 })
    }
  }

  const { error } = await supabase
    .from('institution_members')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', memberId)
    .eq('institution_id', institutionId)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const stateHash = await generateHash({
    institution_id: institutionId,
    user_id: member.user_id,
    role: member.role,
    revoked_by: user.id,
  })

  await createAuditEvent(
    null,
    user.id,
    'institution_member_removed',
    'institution_member',
    member.user_id,
    null,
    stateHash,
    { institution_id: institutionId, role: member.role }
  )

  return NextResponse.json({ success: true })
}
