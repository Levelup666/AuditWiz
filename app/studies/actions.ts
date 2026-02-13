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

  const title = formData.get('title') as string
  const description = (formData.get('description') as string) || null
  const status = (formData.get('status') as StudyStatus) || 'draft'

  if (!title?.trim()) {
    return { error: 'Title is required' }
  }

  const { data: study, error: studyError } = await supabase
    .from('studies')
    .insert({
      title: title.trim(),
      description: description?.trim() || null,
      status,
      created_by: user.id,
    })
    .select('id')
    .single()

  if (studyError) {
    return { error: studyError.message }
  }

  const { error: memberError } = await supabase.from('study_members').insert({
    study_id: study.id,
    user_id: user.id,
    role: 'admin',
    granted_by: user.id,
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
    user.id,
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
