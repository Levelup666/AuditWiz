'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { hashInviteToken } from '@/lib/invites/token'
import { lookupInviteByTokenHash } from '@/lib/invites/lookup-invite-by-token'
import { acceptStudyInviteForUser } from '@/lib/invites/accept-study'
import { acceptInstitutionInviteForUser } from '@/lib/invites/accept-institution'
import { safeAppPath } from '@/lib/invites/safe-redirect'
import { profileDisplayNameForDb } from '@/lib/profile/member-display-name'

function safeNextPath(next: string | null | undefined): string {
  return safeAppPath(next, '/invites')
}

export async function saveAccountSetup(formData: FormData) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'Not signed in' }
  }

  const first_name_raw = (formData.get('first_name') as string)?.trim() ?? ''
  const last_name_raw = (formData.get('last_name') as string)?.trim() ?? ''
  const nickname_raw = (formData.get('nickname') as string)?.trim() ?? ''
  const nickname = nickname_raw ? nickname_raw : null

  const emailInvites = formData.get('notification_email_invites') === 'on'
  const emailStudy = formData.get('notification_email_study_activity') === 'on'
  const nextRaw = (formData.get('next') as string) || '/invites'
  const next = safeNextPath(nextRaw)
  const inviteToken = (formData.get('invite_token') as string)?.trim() || ''
  const password = (formData.get('password') as string)?.trim() || ''
  const confirmPassword = (formData.get('confirm_password') as string)?.trim() || ''

  const { data: prof } = await supabase
    .from('profiles')
    .select('id, account_setup_completed_at, first_name, last_name')
    .eq('id', user.id)
    .maybeSingle()

  const inviteDriven = Boolean(inviteToken)
  const firstCompletion = !prof?.account_setup_completed_at

  if (inviteDriven && !password) {
    return { error: 'Set a password before accepting your invitation.' }
  }

  if (inviteDriven || firstCompletion) {
    if (!first_name_raw || !last_name_raw) {
      return { error: 'First name and last name are required.' }
    }
  }

  if (password || confirmPassword) {
    if (password.length < 8) {
      return { error: 'Use at least 8 characters for your password.' }
    }
    if (password !== confirmPassword) {
      return { error: 'Passwords do not match.' }
    }

    const { error: passwordError } = await supabase.auth.updateUser({ password })
    if (passwordError) {
      return { error: `Password update failed: ${passwordError.message}` }
    }
  }

  const first_name = first_name_raw || prof?.first_name?.trim() || ''
  const last_name = last_name_raw || prof?.last_name?.trim() || ''

  if (!first_name || !last_name) {
    return { error: 'First name and last name are required.' }
  }

  const display_name = profileDisplayNameForDb({
    first_name,
    last_name,
    nickname,
  })

  const payload = {
    first_name,
    last_name,
    nickname,
    display_name,
    notification_email_invites: emailInvites,
    notification_email_study_activity: emailStudy,
    account_setup_completed_at: new Date().toISOString(),
  }

  const { error } = prof?.id
    ? await supabase.from('profiles').update(payload).eq('id', user.id)
    : await supabase.from('profiles').insert({ id: user.id, ...payload })

  if (error) {
    return { error: error.message }
  }

  if (inviteToken) {
    const admin = createAdminClient()
    const resolved = await lookupInviteByTokenHash(admin, hashInviteToken(inviteToken))
    if (
      resolved &&
      !resolved.acceptedAt &&
      !resolved.revokedAt &&
      new Date(resolved.expiresAt) > new Date()
    ) {
      const acceptResult =
        resolved.kind === 'study'
          ? await acceptStudyInviteForUser(
              supabase,
              user.id,
              user.email ?? undefined,
              resolved.studyId,
              resolved.inviteId
            )
          : await acceptInstitutionInviteForUser(
              supabase,
              user.id,
              user.email ?? undefined,
              resolved.institutionId,
              resolved.inviteId
            )

      if (!acceptResult.ok) {
        return { error: acceptResult.error }
      }

      await supabase.auth.signOut()
      const notice = encodeURIComponent(
        'You were signed out so you can sign in again with your new password and continue.'
      )
      if (resolved.kind === 'study') {
        redirect(
          `/auth/signin?inviteNotice=${notice}&redirectedFrom=${encodeURIComponent(`/studies/${resolved.studyId}`)}`
        )
      }
      redirect(
        `/auth/signin?inviteNotice=${notice}&redirectedFrom=${encodeURIComponent('/institutions')}`
      )
    }
  }

  revalidatePath('/invites')
  revalidatePath('/account/setup')
  redirect(next)
}
