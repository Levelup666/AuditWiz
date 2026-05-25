'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAuditEvent } from '@/lib/supabase/audit'
import { generateHash } from '@/lib/crypto'
import { canCreateStudyInInstitution } from '@/lib/supabase/permissions'
import { bootstrapStudyCreatorAsAdmin } from '@/lib/supabase/bootstrap-study-creator'

export async function createStudy(formData: FormData) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/auth/signin')
  }
  const userId = user!.id

  const title = formData.get('title') as string
  const description = (formData.get('description') as string) || null
  const institutionId = (formData.get('institution_id') as string)?.trim() || ''
  const status = 'active' as const

  if (!title?.trim()) {
    return { error: 'Title is required' }
  }

  if (!institutionId) {
    return {
      error:
        'An institution is required. You must be an institution admin to create a study—complete onboarding or ask an institution admin to promote you.',
    }
  }

  const canCreate = await canCreateStudyInInstitution(userId, institutionId)
  if (!canCreate) {
    return {
      error:
        'You do not have permission to create studies in this institution. Only institution admins can create studies.',
    }
  }

  const { data: study, error: studyError } = await supabase
    .from('studies')
    .insert({
      title: title.trim(),
      description: description?.trim() || null,
      status,
      institution_id: institutionId,
      created_by: userId,
    })
    .select('id')
    .single()

  if (studyError) {
    return { error: studyError.message }
  }

  const bootstrap = await bootstrapStudyCreatorAsAdmin(study.id, userId)
  if (!bootstrap.ok) {
    return {
      error: bootstrap.error,
      studyId: study.id,
      studyTitle: title.trim(),
    }
  }

  const memberJoinedHash = await generateHash({
    study_id: study.id,
    user_id: userId,
    role: 'admin',
    source: 'study_created',
  })
  await createAuditEvent(
    study.id,
    userId,
    'study_member_joined',
    'study_member',
    userId,
    null,
    memberJoinedHash,
    { role: 'admin', source: 'study_created' }
  )

  const newStateHash = await generateHash({
    study_id: study.id,
    title: title.trim(),
    description: description?.trim() ?? null,
    status,
    institution_id: institutionId,
  })

  await createAuditEvent(
    study.id,
    userId,
    'study_created',
    'study',
    study.id,
    null,
    newStateHash,
    { title: title.trim(), status, institution_id: institutionId }
  )

  revalidatePath('/studies')
  revalidatePath(`/studies/${study.id}`)

  return {
    success: true as const,
    studyId: study.id,
    studyTitle: title.trim(),
  }
}
