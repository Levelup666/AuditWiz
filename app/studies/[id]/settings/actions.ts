'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { canManageStudyMembers } from '@/lib/supabase/permissions'
import { createAuditEvent } from '@/lib/supabase/audit'
import { generateHash } from '@/lib/crypto'
import { assertStudyIsActive } from '@/lib/supabase/study-status'
import { getStudyCompletionEligibility } from '@/lib/study-completion-eligibility'
import type { StudyStatus } from '@/lib/types'
import { getStudyAbsoluteMemberCap } from '@/lib/study-member-cap'

export interface StudySettingsInput {
  required_approval_count: number
  require_review_before_approval: boolean
  allow_creator_approval: boolean
  ai_enabled?: boolean
  /** Omit or null to use the platform default member cap */
  max_members?: number | null
}

export async function updateStudySettings(
  studyId: string,
  settings: StudySettingsInput
) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/auth/signin')
  }
  const allowed = await canManageStudyMembers(user!.id, studyId)
  if (!allowed) {
    return { error: 'You do not have permission to update study settings' }
  }

  const activeCheck = await assertStudyIsActive(supabase, studyId)
  if (!activeCheck.ok) {
    return { error: activeCheck.error }
  }

  const count = Math.max(1, Math.floor(settings.required_approval_count))
  if (Number.isNaN(count) || count < 1) {
    return { error: 'Required approval count must be at least 1' }
  }

  const { data: existing } = await supabase
    .from('studies')
    .select('metadata')
    .eq('id', studyId)
    .single()

  const existingMetadata = (existing?.metadata ?? {}) as Record<string, unknown>
  const metadata =
    settings.ai_enabled !== undefined
      ? { ...existingMetadata, ai_enabled: settings.ai_enabled }
      : existingMetadata

  const updatePayload: Record<string, unknown> = {
    required_approval_count: count,
    require_review_before_approval: Boolean(settings.require_review_before_approval),
    allow_creator_approval: Boolean(settings.allow_creator_approval),
    metadata,
  }

  if (settings.max_members !== undefined) {
    const abs = getStudyAbsoluteMemberCap()
    let nextMax: number | null
    if (settings.max_members === null) {
      nextMax = null
    } else {
      const n = Math.floor(Number(settings.max_members))
      if (!Number.isFinite(n) || n < 1) {
        return { error: 'Member cap must be at least 1, or leave empty for platform default' }
      }
      if (n > abs) {
        return { error: `Member cap cannot exceed ${abs}` }
      }
      nextMax = n
    }

    if (nextMax !== null) {
      const { data: sm } = await supabase
        .from('study_members')
        .select('user_id')
        .eq('study_id', studyId)
        .is('revoked_at', null)
      const distinct = new Set((sm ?? []).map((r) => r.user_id)).size
      if (nextMax < distinct) {
        return {
          error: `Member cap cannot be below the current distinct member count (${distinct}).`,
        }
      }
    }

    updatePayload.max_members = nextMax
  }

  const { error } = await supabase.from('studies').update(updatePayload).eq('id', studyId)

  if (error) {
    return { error: error.message }
  }

  revalidatePath(`/studies/${studyId}`)
  revalidatePath(`/studies/${studyId}/settings`)
  return {}
}

/** Status transitions managed in study settings (admin only). */
export type StudyLifecycleUpdate = Extract<
  StudyStatus,
  'active' | 'completed' | 'archived'
>

export async function updateStudyStatus(
  studyId: string,
  nextStatus: StudyLifecycleUpdate
) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/auth/signin')
  }
  const allowed = await canManageStudyMembers(user.id, studyId)
  if (!allowed) {
    return { error: 'You do not have permission to change study status' }
  }

  const { data: study, error: fetchError } = await supabase
    .from('studies')
    .select('id, status, title')
    .eq('id', studyId)
    .single()

  if (fetchError || !study) {
    return { error: 'Study not found' }
  }

  const current = study.status as StudyStatus

  if (nextStatus === 'active') {
    if (current !== 'completed' && current !== 'archived') {
      return {
        error:
          'Only a completed or archived study can be set back to active.',
      }
    }

    const previousHash = await generateHash({
      study_id: studyId,
      status: current,
    })
    const newHash = await generateHash({
      study_id: studyId,
      status: 'active',
    })

    const { error } = await supabase
      .from('studies')
      .update({ status: 'active' })
      .eq('id', studyId)
      .in('status', ['completed', 'archived'])

    if (error) {
      return { error: error.message }
    }

    await createAuditEvent(
      studyId,
      user.id,
      'study_updated',
      'study',
      studyId,
      previousHash,
      newHash,
      { field: 'status', previous: current, next: 'active' }
    )

    revalidatePath('/studies')
    revalidatePath(`/studies/${studyId}`)
    revalidatePath(`/studies/${studyId}/settings`)
    return {}
  }

  if (current !== 'active') {
    return {
      error:
        'Only an active study can be marked completed or archived.',
    }
  }

  if (nextStatus === 'completed') {
    const eligibility = await getStudyCompletionEligibility(supabase, studyId)
    if (!eligibility.canComplete) {
      return { error: eligibility.reason ?? 'Study cannot be completed yet.' }
    }
  }

  const previousHash = await generateHash({
    study_id: studyId,
    status: current,
  })
  const newHash = await generateHash({
    study_id: studyId,
    status: nextStatus,
  })

  const { error } = await supabase
    .from('studies')
    .update({ status: nextStatus })
    .eq('id', studyId)
    .eq('status', 'active')

  if (error) {
    return { error: error.message }
  }

  await createAuditEvent(
    studyId,
    user.id,
    'study_updated',
    'study',
    studyId,
    previousHash,
    newHash,
    { field: 'status', previous: current, next: nextStatus }
  )

  revalidatePath('/studies')
  revalidatePath(`/studies/${studyId}`)
  revalidatePath(`/studies/${studyId}/settings`)
  return {}
}
