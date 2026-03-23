'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAuditEvent } from '@/lib/supabase/audit'
import { generateHash } from '@/lib/crypto'
import { isValidInstitutionResearchField } from '@/lib/institution-research-types'
import { parseAllowExternalFromForm } from '@/lib/institution-collaboration'

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

export async function createInstitution(formData: FormData) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/auth/signin')
  }

  const name = (formData.get('name') as string)?.trim()
  const slugInput = (formData.get('slug') as string)?.trim()
  const description = (formData.get('description') as string)?.trim() || null
  const domain = (formData.get('domain') as string)?.trim() || null
  const researchField = (formData.get('research_field') as string)?.trim()
  const allowExternalCollaborators = parseAllowExternalFromForm(
    formData.get('allow_external_collaborators')?.toString()
  )

  if (!name) {
    return { error: 'Institution name is required' }
  }

  if (!researchField || !isValidInstitutionResearchField(researchField)) {
    return { error: 'Please select a valid primary research field.' }
  }

  const slug = slugInput || slugify(name)
  if (!slug) {
    return { error: 'Could not generate a valid slug from the name' }
  }

  const { data: existing } = await supabase
    .from('institutions')
    .select('id')
    .eq('slug', slug)
    .maybeSingle()

  if (existing) {
    return { error: 'An institution with this slug already exists. Please choose a different one.' }
  }

  const { data: institution, error: instError } = await supabase
    .from('institutions')
    .insert({
      name,
      slug,
      description: description || null,
      domain: domain || null,
      metadata: {
        research_field: researchField,
        allow_external_collaborators: allowExternalCollaborators,
      },
      created_by: user.id,
    })
    .select('id')
    .single()

  if (instError) {
    return { error: instError.message }
  }

  const { error: memberError } = await supabase.from('institution_members').insert({
    institution_id: institution.id,
    user_id: user.id,
    role: 'admin',
    granted_by: user.id,
  })

  if (memberError) {
    return { error: memberError.message }
  }

  const newStateHash = await generateHash({
    institution_id: institution.id,
    name,
    slug,
    research_field: researchField,
    allow_external_collaborators: allowExternalCollaborators,
  })

  await createAuditEvent(
    null,
    user.id,
    'institution_created',
    'institution',
    institution.id,
    null,
    newStateHash,
    {
      name,
      slug,
      research_field: researchField,
      allow_external_collaborators: allowExternalCollaborators,
    }
  )

  revalidatePath('/onboarding')
  revalidatePath('/institutions')
  revalidatePath('/studies')
  redirect('/studies/new')
}
