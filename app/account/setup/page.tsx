import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import AccountSetupForm from '@/components/account/account-setup-form'
import { Button } from '@/components/ui/button'
import { safeAppPath } from '@/lib/invites/safe-redirect'
import { findOrcidAuthIdentity, isOrcidPrimaryAccount } from '@/lib/auth/is-orcid-auth'
import { extractOrcidFromSupabaseIdentity } from '@/lib/auth/orcid-id'
import {
  userNeedsOrcidEmailCapture,
  userNeedsOrcidEmailInput,
} from '@/lib/auth/orcid-email-requirements'
import { loadAllowedOrcidEmails } from '@/lib/auth/orcid-email-resolve'
import { orcidEmailRequiresAttestation } from '@/lib/auth/validate-orcid-email'
import { userHasUsableAuthEmail } from '@/lib/auth/orcid-email'

interface AccountSetupPageProps {
  searchParams: Promise<{
    next?: string
    invite?: string
    pending_invite?: string
    orcid_email_required?: string
  }>
}

export default async function AccountSetupPage({ searchParams }: AccountSetupPageProps) {
  const {
    next: nextParam,
    invite: inviteParam,
    pending_invite: pendingInviteParam,
    orcid_email_required: orcidEmailRequiredParam,
  } = await searchParams
  const nextPath = safeAppPath(nextParam ?? null, '/invites')
  const inviteToken = inviteParam?.trim() || ''
  const pendingInviteFlow =
    pendingInviteParam === '1' || pendingInviteParam?.toLowerCase() === 'true'
  const inviteDriven =
    Boolean(inviteToken) || nextPath.startsWith('/invite/') || pendingInviteFlow

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect(`/auth/signin?redirectedFrom=/account/setup?next=${encodeURIComponent(nextPath)}`)
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select(
      'first_name, last_name, nickname, orcid_id, orcid_verified, orcid_email_locked, notification_email_invites, notification_email_study_activity, account_setup_completed_at'
    )
    .eq('id', user.id)
    .maybeSingle()

  const orcidPrimary = isOrcidPrimaryAccount(user, profile)
  const forceOrcidEmail =
    orcidEmailRequiredParam === '1' ||
    orcidEmailRequiredParam?.toLowerCase() === 'true'
  const needsOrcidEmail = userNeedsOrcidEmailCapture(user, profile) || forceOrcidEmail
  const showOrcidEmailInput = userNeedsOrcidEmailInput(user, profile, {
    forceRequired: forceOrcidEmail,
  })

  const orcidIdentity = findOrcidAuthIdentity(user)
  const orcidIdForEmails =
    profile?.orcid_id ??
    (orcidIdentity
      ? extractOrcidFromSupabaseIdentity({
          identity_id: orcidIdentity.identity_id,
          identity_data: (orcidIdentity.identity_data ?? null) as Record<
            string,
            unknown
          > | null,
        })
      : null)

  let orcidDiscoverableEmails: string[] = []
  if (showOrcidEmailInput && orcidIdForEmails) {
    const { data: sessionData } = await supabase.auth.getSession()
    const providerToken = sessionData.session?.provider_token
    const allowed = await loadAllowedOrcidEmails({
      orcidId: orcidIdForEmails,
      identityData: orcidIdentity?.identity_data as Record<string, unknown> | null,
      providerAccessToken:
        typeof providerToken === 'string' ? providerToken : null,
    })
    orcidDiscoverableEmails = allowed.emails
  }

  const hasUsableEmail = userHasUsableAuthEmail(user.email)

  return (
    <div className="mx-auto max-w-2xl space-y-8 px-4 py-10">
      <div>
        <p className="text-sm font-medium text-muted-foreground">Welcome</p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight text-foreground">
          Set up your account
        </h1>
        <p className="mt-2 text-muted-foreground">
          {showOrcidEmailInput ? (
            <>
              Your ORCID account needs a contact email for invites and notifications. Enter the same
              address you use on ORCID.org. After it is saved, it cannot be changed in AuditWiz.
              {orcidDiscoverableEmails.length === 0
                ? ' If your email is private on ORCID, type it here and confirm—it is the usual path when only the public ORCID API is available.'
                : ' Select a suggested address or type the one on your ORCID record.'}
            </>
          ) : inviteDriven ? (
            <>
              Finish getting started after your invitation: set a password, enter your first and
              last name (and optional nickname), then choose notification preferences. You need a
              password and legal name on file before you can accept invites under{' '}
              <strong>Invites</strong> in the app.
            </>
          ) : orcidPrimary ? (
            <>
              Complete your profile: first and last name, optional nickname, and notification
              preferences. Your contact email comes from ORCID and cannot be edited here.
            </>
          ) : (
            <>
              Complete your profile: first and last name, optional nickname, and notification
              preferences. You can skip and return later from your profile or Invites.
            </>
          )}
        </p>
      </div>

      <AccountSetupForm
        nextPath={nextPath}
        inviteToken={inviteToken || undefined}
        pendingInviteFlow={pendingInviteFlow}
        userEmail={user.email ?? ''}
        orcidPrimary={orcidPrimary}
        orcidEmailLocked={Boolean(profile?.orcid_email_locked)}
        needsOrcidEmail={needsOrcidEmail}
        showOrcidEmailInput={showOrcidEmailInput}
        orcidDiscoverableEmails={orcidDiscoverableEmails}
        orcidEmailRequiresAttestation={orcidEmailRequiresAttestation(orcidDiscoverableEmails)}
        notificationsDisabled={showOrcidEmailInput || (needsOrcidEmail && !hasUsableEmail)}
        initialFirstName={profile?.first_name ?? null}
        initialLastName={profile?.last_name ?? null}
        initialNickname={profile?.nickname ?? null}
        initialEmailInvites={profile?.notification_email_invites ?? true}
        initialEmailStudy={profile?.notification_email_study_activity ?? true}
      />

      {!inviteDriven && !showOrcidEmailInput ? (
        <div className="flex justify-center border-t pt-6">
          <Button variant="ghost" size="sm" asChild>
            <Link href={nextPath}>Skip for now</Link>
          </Button>
        </div>
      ) : null}
    </div>
  )
}
