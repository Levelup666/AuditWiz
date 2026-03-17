'use server'

import { createClient } from '@/lib/supabase/server'
import { createAuditEvent } from '@/lib/supabase/audit'
import { generateHash } from '@/lib/crypto'
import { canManageInstitution } from '@/lib/supabase/permissions'
import { revalidatePath } from 'next/cache'

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

  if (!name) {
    return { error: 'Name is required' }
  }

  const { error } = await supabase
    .from('institutions')
    .update({
      name,
      description,
      domain,
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
  })

  await createAuditEvent(
    null,
    user.id,
    'institution_updated',
    'institution',
    institutionId,
    null,
    stateHash,
    { name, description, domain }
  )

  revalidatePath(`/institutions/${institutionId}`)
  revalidatePath(`/institutions/${institutionId}/settings`)

  return {}
}
