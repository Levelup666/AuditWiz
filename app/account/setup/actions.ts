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
import { isOrcidPrimaryAccount } from '@/lib/auth/is-orcid-auth'
import { setOrcidLockedEmailForUser } from '@/lib/auth/sync-orcid-email'
import {
  userNeedsOrcidEmailCapture,
  userNeedsOrcidEmailInput,
} from '@/lib/auth/orcid-email-requirements'
import { userHasUsableAuthEmail } from '@/lib/auth/orcid-email'
import {
  parseRotationDays,
  userSubjectToPasswordPolicy,
  validatePassword,
} from '@/lib/auth/password-policy'
import {
  auditPasswordChanged,
  auditPasswordRotationPreferenceUpdated,
} from '@/lib/auth/password-audit'

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
  const pendingInviteFlow = formData.get('pending_invite_flow') === 'on'
  const password = (formData.get('password') as string)?.trim() || ''
  const confirmPassword = (formData.get('confirm_password') as string)?.trim() || ''

  const rotationDaysRaw = formData.get('password_rotation_days')

  const { data: prof } = await supabase
    .from('profiles')
    .select(
      'id, account_setup_completed_at, first_name, last_name, orcid_id, orcid_verified, orcid_email_locked, password_policy_legacy, password_rotation_days, password_last_changed_at'
    )
    .eq('id', user.id)
    .maybeSingle()

  const orcidPrimary = isOrcidPrimaryAccount(user, prof)
  const needsOrcidEmail = userNeedsOrcidEmailCapture(user, prof)
  const showOrcidEmailInput = userNeedsOrcidEmailInput(user, prof)
  const orcidContactEmail = (formData.get('orcid_contact_email') as string)?.trim() ?? ''
  let orcidEmailRequiresSessionRefresh = false

  if (
    prof?.orcid_email_locked &&
    orcidContactEmail &&
    userHasUsableAuthEmail(user.email)
  ) {
    return { error: 'Your contact email is locked to your ORCID email and cannot be changed.' }
  }

  if (showOrcidEmailInput) {
    if (!orcidContactEmail) {
      return { error: 'Enter the email address on your ORCID record.' }
    }
    const orcidEmailAttested = formData.get('orcid_email_attested') === 'on'
    const emailRes = await setOrcidLockedEmailForUser(supabase, orcidContactEmail, {
      attested: orcidEmailAttested,
    })
    if (!emailRes.ok) return { error: emailRes.error }
    orcidEmailRequiresSessionRefresh = Boolean(emailRes.requiresSessionRefresh)
  }

  const {
    data: { user: userAfterEmail },
  } = await supabase.auth.getUser()
  const actor = userAfterEmail ?? user

  const hasInviteToken = Boolean(inviteToken)
  const firstCompletion = !prof?.account_setup_completed_at

  if ((hasInviteToken || (firstCompletion && pendingInviteFlow)) && !orcidPrimary && !password) {
    return { error: 'Set a password before continuing with your invitation.' }
  }

  if (hasInviteToken || firstCompletion || pendingInviteFlow) {
    if (!first_name_raw || !last_name_raw) {
      return { error: 'First name and last name are required.' }
    }
  }

  const subjectToPolicy = userSubjectToPasswordPolicy(actor, prof)
  const rotationDaysParsed = parseRotationDays(rotationDaysRaw)

  if (password || confirmPassword) {
    if (password !== confirmPassword) {
      return { error: 'Passwords do not match.' }
    }
    const check = validatePassword(password, { email: actor.email })
    if (!check.ok) {
      return { error: check.errors[0] ?? 'Password does not meet requirements.' }
    }

    const { error: passwordError } = await supabase.auth.updateUser({ password })
    if (passwordError) {
      return { error: `Password update failed: ${passwordError.message}` }
    }
    if (subjectToPolicy) {
      await auditPasswordChanged(actor.id)
    }
  }

  if (subjectToPolicy && !prof?.password_rotation_days) {
    if (!rotationDaysParsed) {
      return {
        error: 'Choose how often you want to change your password (30, 60, or 90 days).',
      }
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

  const nowIso = new Date().toISOString()
  const payload: Record<string, unknown> = {
    first_name,
    last_name,
    nickname,
    display_name,
    notification_email_invites: emailInvites,
    notification_email_study_activity: emailStudy,
    account_setup_completed_at: nowIso,
  }

  if (subjectToPolicy && rotationDaysParsed && !prof?.password_rotation_days) {
    payload.password_rotation_days = rotationDaysParsed
    await auditPasswordRotationPreferenceUpdated(actor.id, rotationDaysParsed, null)
  }

  if (subjectToPolicy && (password || rotationDaysParsed) && !prof?.password_last_changed_at) {
    payload.password_last_changed_at = nowIso
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
              actor.id,
              actor.email ?? undefined,
              resolved.studyId,
              resolved.inviteId
            )
          : await acceptInstitutionInviteForUser(
              supabase,
              actor.id,
              actor.email ?? undefined,
              resolved.institutionId,
              resolved.inviteId
            )

      if (!acceptResult.ok) {
        return { error: acceptResult.error }
      }

      if (orcidPrimary) {
        revalidatePath('/invites')
        revalidatePath('/account/setup')
        let dest =
          resolved.kind === 'study'
            ? `/studies/${resolved.studyId}`
            : '/institutions'
        if (orcidEmailRequiresSessionRefresh) {
          const sep = dest.includes('?') ? '&' : '?'
          dest = `${dest}${sep}orcid_session_refresh=1`
        }
        redirect(dest)
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
  if (orcidEmailRequiresSessionRefresh) {
    const sep = next.includes('?') ? '&' : '?'
    redirect(`${next}${sep}orcid_session_refresh=1`)
  }
  redirect(next)
}
