import type { SupabaseClient } from '@supabase/supabase-js'

export type ResolvedInvite =
  | {
      kind: 'study'
      inviteId: string
      studyId: string
      role: string
      email: string | null
      orcidId: string | null
      expiresAt: string
      acceptedAt: string | null
      revokedAt: string | null
      invitedBy: string
      tokenHash: string
      studyTitle: string | null
      inviterDisplay: string | null
    }
  | {
      kind: 'institution'
      inviteId: string
      institutionId: string
      role: string
      email: string | null
      expiresAt: string
      acceptedAt: string | null
      revokedAt: string | null
      invitedBy: string
      tokenHash: string
      institutionName: string | null
      inviterDisplay: string | null
    }
  | {
      kind: 'audit_engagement'
      inviteId: string
      institutionId: string
      role: 'auditor'
      email: string | null
      expiresAt: string
      acceptedAt: string | null
      revokedAt: string | null
      invitedBy: string
      tokenHash: string
      institutionName: string | null
      inviterDisplay: string | null
      scope: 'institution_wide' | 'specific_studies'
      startsAt: string
      purpose: string | null
    }

export async function lookupInviteByTokenHash(
  admin: SupabaseClient,
  tokenHash: string
): Promise<ResolvedInvite | null> {
  const { data: studyInvite } = await admin
    .from('study_member_invites')
    .select(
      `
      id,
      study_id,
      email,
      orcid_id,
      role,
      invited_by,
      expires_at,
      accepted_at,
      revoked_at,
      token_hash,
      study:studies(id, title)
    `
    )
    .eq('token_hash', tokenHash)
    .maybeSingle()

  if (studyInvite) {
    const rawStudy = studyInvite.study as
      | { id: string; title: string }
      | { id: string; title: string }[]
      | null
    const study = Array.isArray(rawStudy) ? rawStudy[0] ?? null : rawStudy
    let inviterDisplay: string | null = null
    try {
      const { data: inv } = await admin.auth.admin.getUserById(studyInvite.invited_by)
      inviterDisplay = inv.user?.email ?? null
    } catch {
      inviterDisplay = null
    }
    return {
      kind: 'study',
      inviteId: studyInvite.id,
      studyId: studyInvite.study_id,
      role: studyInvite.role,
      email: studyInvite.email,
      orcidId: studyInvite.orcid_id,
      expiresAt: studyInvite.expires_at,
      acceptedAt: studyInvite.accepted_at,
      revokedAt: studyInvite.revoked_at,
      invitedBy: studyInvite.invited_by,
      tokenHash: studyInvite.token_hash,
      studyTitle: study?.title ?? null,
      inviterDisplay,
    }
  }

  const { data: instInvite } = await admin
    .from('institution_invites')
    .select(
      `
      id,
      institution_id,
      email,
      role,
      invited_by,
      expires_at,
      accepted_at,
      revoked_at,
      token_hash,
      institution:institutions(id, name)
    `
    )
    .eq('token_hash', tokenHash)
    .maybeSingle()

  if (instInvite) {
    const rawInst = instInvite.institution as
      | { id: string; name: string }
      | { id: string; name: string }[]
      | null
    const institution = Array.isArray(rawInst) ? rawInst[0] ?? null : rawInst
    let inviterDisplay: string | null = null
    try {
      const { data: inv } = await admin.auth.admin.getUserById(instInvite.invited_by)
      inviterDisplay = inv.user?.email ?? null
    } catch {
      inviterDisplay = null
    }

    return {
      kind: 'institution',
      inviteId: instInvite.id,
      institutionId: instInvite.institution_id,
      role: instInvite.role,
      email: instInvite.email,
      expiresAt: instInvite.expires_at,
      acceptedAt: instInvite.accepted_at,
      revokedAt: instInvite.revoked_at,
      invitedBy: instInvite.invited_by,
      tokenHash: instInvite.token_hash,
      institutionName: institution?.name ?? null,
      inviterDisplay,
    }
  }

  const { data: engagement } = await admin
    .from('audit_engagements')
    .select(
      `
      id,
      institution_id,
      auditor_email,
      starts_at,
      expires_at,
      accepted_at,
      revoked_at,
      granted_by,
      token_hash,
      scope,
      purpose,
      institution:institutions(id, name)
    `
    )
    .eq('token_hash', tokenHash)
    .maybeSingle()

  if (!engagement) return null

  const rawEngInst = engagement.institution as
    | { id: string; name: string }
    | { id: string; name: string }[]
    | null
  const engInstitution = Array.isArray(rawEngInst) ? rawEngInst[0] ?? null : rawEngInst

  let engInviterDisplay: string | null = null
  try {
    const { data: inv } = await admin.auth.admin.getUserById(engagement.granted_by)
    engInviterDisplay = inv.user?.email ?? null
  } catch {
    engInviterDisplay = null
  }

  return {
    kind: 'audit_engagement',
    inviteId: engagement.id,
    institutionId: engagement.institution_id,
    role: 'auditor',
    email: engagement.auditor_email,
    expiresAt: engagement.expires_at,
    acceptedAt: engagement.accepted_at,
    revokedAt: engagement.revoked_at,
    invitedBy: engagement.granted_by,
    tokenHash: engagement.token_hash,
    institutionName: engInstitution?.name ?? null,
    inviterDisplay: engInviterDisplay,
    scope: engagement.scope as 'institution_wide' | 'specific_studies',
    startsAt: engagement.starts_at,
    purpose: engagement.purpose,
  }
}

export function maskEmail(email: string | null): string | null {
  if (!email || !email.includes('@')) return email
  const [local, domain] = email.split('@')
  if (local.length <= 2) return `•••@${domain}`
  return `${local.slice(0, 2)}•••@${domain}`
}
