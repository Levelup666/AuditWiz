'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAuditEvent } from '@/lib/supabase/audit'
import { generateHash } from '@/lib/crypto'
import type { StudyStatus } from '@/lib/types'

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
  const status = (formData.get('status') as StudyStatus) || 'draft'
  const institutionId = (formData.get('institution_id') as string)?.trim() || null

  if (!title?.trim()) {
    return { error: 'Title is required' }
  }

  if (institutionId) {
    const canCreate = await import('@/lib/supabase/permissions').then((m) =>
      m.canCreateStudyInInstitution(userId, institutionId)
    )
    if (!canCreate) {
      return { error: 'You do not have permission to create studies in this institution' }
    }
  }

  const { data: study, error: studyError } = await supabase
    .from('studies')
    .insert({
      title: title.trim(),
      description: description?.trim() || null,
      status,
      institution_id: institutionId || null,
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
  })

  await createAuditEvent(
    study.id,
    userId,
    'study_created',
    'study',
    study.id,
    null,
    newStateHash,
    { title: title.trim(), status }
  )

  revalidatePath('/studies')
  redirect(`/studies/${study.id}`)
}
