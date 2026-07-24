'use server'

import { createClient } from '@/lib/supabase/server'
import { createAuditEvent } from '@/lib/supabase/audit'
import { generateHash } from '@/lib/crypto'
import { canManageInstitution } from '@/lib/supabase/permissions'
import { revalidatePath } from 'next/cache'
import { isValidInstitutionResearchField } from '@/lib/institution-research-types'
import {
  institutionAllowsExternalCollaborators,
  parseAllowExternalFromForm,
} from '@/lib/institution-collaboration'
import {
  institutionRequiresFreshEmailForAuditorInvites,
  parseRequireFreshAuditorEmailFromForm,
} from '@/lib/auditor/auditor-invite-policy'
import {
  AUDITOR_REFERENCE_ID_FORMAT_KEY,
  AUDITOR_REFERENCE_ID_LABEL_KEY,
  AUDITOR_REFERENCE_ID_REQUIRED_KEY,
  getAuditorReferenceIdPolicy,
  parseAuditorReferenceIdFormatFromForm,
  parseAuditorReferenceIdLabelFromForm,
  parseAuditorReferenceIdRequiredFromForm,
} from '@/lib/auditor/auditor-credential-policy'

export async function updateInstitution(
  institutionId: string,
  formData: FormData
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'Unauthorized' }
  }

  const allowed = await canManageInstitution(user.id, institutionId)
  if (!allowed) {
    return { error: 'Forbidden' }
  }

  const name = formData.get('name')?.toString()?.trim()
  const description = formData.get('description')?.toString()?.trim() || null
  const domain = formData.get('domain')?.toString()?.trim() || null
  const researchField = formData.get('research_field')?.toString()?.trim()
  const allowExternalCollaborators = parseAllowExternalFromForm(
    formData.get('allow_external_collaborators')?.toString()
  )
  const auditorInvitesRequireFreshEmail = parseRequireFreshAuditorEmailFromForm(
    formData.get('auditor_invites_require_fresh_email')?.toString()
  )
  const auditorReferenceIdFormat = parseAuditorReferenceIdFormatFromForm(
    formData.get('auditor_reference_id_format')?.toString()
  )
  const auditorReferenceIdLabel = parseAuditorReferenceIdLabelFromForm(
    formData.get('auditor_reference_id_label')?.toString()
  )
  const auditorReferenceIdRequired = parseAuditorReferenceIdRequiredFromForm(
    formData.get('auditor_reference_id_required')?.toString()
  )

  if (auditorReferenceIdFormat) {
    try {
      // eslint-disable-next-line no-new
      new RegExp(`^(?:${auditorReferenceIdFormat})$`)
    } catch {
      return {
        error:
          'Auditor reference ID format is not a valid regular expression. Example: ENG-\\d{4}',
      }
    }
  }

  if (!name) {
    return { error: 'Name is required' }
  }

  if (!researchField || !isValidInstitutionResearchField(researchField)) {
    return { error: 'Please select a valid primary research field.' }
  }

  const { data: current, error: fetchErr } = await supabase
    .from('institutions')
    .select('metadata')
    .eq('id', institutionId)
    .single()

  if (fetchErr) {
    return { error: fetchErr.message }
  }

  const prevMeta =
    current?.metadata && typeof current.metadata === 'object' && !Array.isArray(current.metadata)
      ? (current.metadata as Record<string, unknown>)
      : {}
  const prevAllowExternal = institutionAllowsExternalCollaborators(prevMeta)

  if (prevAllowExternal && !allowExternalCollaborators) {
    const { data: blockers, error: rpcErr } = await supabase.rpc(
      'institution_external_collaborator_rows',
      { p_institution_id: institutionId }
    )
    if (rpcErr) {
      return { error: rpcErr.message }
    }
    const rows = (blockers ?? []) as Array<{ study_title?: string }>
    if (rows.length > 0) {
      const titles = [...new Set(rows.map((r) => r.study_title).filter(Boolean))] as string[]
      const preview = titles.slice(0, 6).join(', ')
      const more = titles.length > 6 ? ` (+${titles.length - 6} more)` : ''
      return {
        error:
          `Cannot require institution members only: ${rows.length} study seat(s) belong to users who are not institution members (studies such as: ${preview}${more}). ` +
          `Invite each person to the institution and wait for them to accept, or remove them from those studies, then try again.`,
      }
    }
  }

  const metadata = {
    ...prevMeta,
    research_field: researchField,
    allow_external_collaborators: allowExternalCollaborators,
    auditor_invites_require_fresh_email: auditorInvitesRequireFreshEmail,
    [AUDITOR_REFERENCE_ID_FORMAT_KEY]: auditorReferenceIdFormat,
    [AUDITOR_REFERENCE_ID_LABEL_KEY]: auditorReferenceIdLabel,
    [AUDITOR_REFERENCE_ID_REQUIRED_KEY]: auditorReferenceIdRequired,
  }

  const { error } = await supabase
    .from('institutions')
    .update({
      name,
      description,
      domain,
      metadata,
      updated_at: new Date().toISOString(),
    })
    .eq('id', institutionId)

  if (error) {
    return { error: error.message }
  }

  const stateHash = await generateHash({
    institution_id: institutionId,
    name,
    description,
    domain,
    research_field: researchField,
    allow_external_collaborators: allowExternalCollaborators,
    auditor_invites_require_fresh_email: auditorInvitesRequireFreshEmail,
    auditor_reference_id_format: auditorReferenceIdFormat,
    auditor_reference_id_required: auditorReferenceIdRequired,
  })

  await createAuditEvent(
    null,
    user.id,
    'institution_updated',
    'institution',
    institutionId,
    null,
    stateHash,
    {
      name,
      description,
      domain,
      research_field: researchField,
      allow_external_collaborators: allowExternalCollaborators,
      auditor_invites_require_fresh_email: auditorInvitesRequireFreshEmail,
      auditor_reference_id_format: auditorReferenceIdFormat,
      auditor_reference_id_required: auditorReferenceIdRequired,
    }
  )

  revalidatePath(`/institutions/${institutionId}`)
  revalidatePath(`/institutions/${institutionId}/settings`)

  return {}
}
