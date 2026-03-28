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

  const displayName = (formData.get('display_name') as string)?.trim() || null
  const emailInvites = formData.get('notification_email_invites') === 'on'
  const emailStudy = formData.get('notification_email_study_activity') === 'on'
  const nextRaw = (formData.get('next') as string) || '/invites'
  const next = safeNextPath(nextRaw)
  const inviteToken = (formData.get('invite_token') as string)?.trim() || ''

  const payload = {
    display_name: displayName,
    notification_email_invites: emailInvites,
    notification_email_study_activity: emailStudy,
    account_setup_completed_at: new Date().toISOString(),
  }

  const { data: existing } = await supabase
    .from('profiles')
    .select('id')
    .eq('id', user.id)
    .maybeSingle()

  const { error } = existing
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
