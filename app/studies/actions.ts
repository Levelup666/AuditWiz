'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAuditEvent } from '@/lib/supabase/audit'
import { generateHash } from '@/lib/crypto'
import { canCreateStudyInInstitution } from '@/lib/supabase/permissions'

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

  const { error: memberError } = await supabase.from('study_members').insert({
    study_id: study.id,
    user_id: userId,
    role: 'admin',
    granted_by: userId,
  })

  if (memberError) {
    return { error: memberError.message }
  }

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
  redirect(`/studies/${study.id}`)
}
