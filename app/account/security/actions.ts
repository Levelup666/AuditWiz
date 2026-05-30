'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import {
  parseRotationDays,
  userSubjectToPasswordPolicy,
  validatePassword,
} from '@/lib/auth/password-policy'
import {
  auditPasswordChanged,
  auditPasswordRotationPreferenceUpdated,
} from '@/lib/auth/password-audit'

export async function updateAccountPassword(formData: FormData) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'Not signed in' }
  }

  const newPassword = (formData.get('new_password') as string)?.trim() || ''
  const confirmPassword = (formData.get('confirm_password') as string)?.trim() || ''

  if (!newPassword) {
    return { error: 'Enter a new password.' }
  }
  if (newPassword !== confirmPassword) {
    return { error: 'Passwords do not match.' }
  }

  const check = validatePassword(newPassword, { email: user.email })
  if (!check.ok) {
    return { error: check.errors[0] ?? 'Password does not meet requirements.' }
  }

  const { error: passwordError } = await supabase.auth.updateUser({ password: newPassword })
  if (passwordError) {
    return { error: passwordError.message }
  }

  const { data: prof } = await supabase
    .from('profiles')
    .select('password_policy_legacy')
    .eq('id', user.id)
    .maybeSingle()

  const nowIso = new Date().toISOString()
  const updates: Record<string, unknown> = { password_last_changed_at: nowIso }

  if (userSubjectToPasswordPolicy(user, prof)) {
    await auditPasswordChanged(user.id)
  }

  const { error: profileError } = await supabase
    .from('profiles')
    .update(updates)
    .eq('id', user.id)

  if (profileError) {
    return { error: profileError.message }
  }

  revalidatePath('/account/security')
  revalidatePath('/profile')
  return { success: true as const }
}

export async function updatePasswordRotationPreference(formData: FormData) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'Not signed in' }
  }

  const { data: prof } = await supabase
    .from('profiles')
    .select('password_policy_legacy, password_rotation_days')
    .eq('id', user.id)
    .maybeSingle()

  if (!userSubjectToPasswordPolicy(user, prof)) {
    return { error: 'Password rotation does not apply to your account.' }
  }

  const days = parseRotationDays(formData.get('password_rotation_days'))
  if (!days) {
    return { error: 'Choose 30, 60, or 90 days.' }
  }

  const previous = prof?.password_rotation_days ?? null

  const { error } = await supabase
    .from('profiles')
    .update({ password_rotation_days: days })
    .eq('id', user.id)

  if (error) {
    return { error: error.message }
  }

  await auditPasswordRotationPreferenceUpdated(user.id, days, previous)

  revalidatePath('/account/security')
  return { success: true as const }
}
