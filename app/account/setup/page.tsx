import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import AccountSetupForm from '@/components/account/account-setup-form'
import { Button } from '@/components/ui/button'
import { safeAppPath } from '@/lib/invites/safe-redirect'

interface AccountSetupPageProps {
  searchParams: Promise<{ next?: string; invite?: string }>
}

export default async function AccountSetupPage({ searchParams }: AccountSetupPageProps) {
  const { next: nextParam, invite: inviteParam } = await searchParams
  const nextPath = safeAppPath(nextParam ?? null, '/invites')
  const inviteToken = inviteParam?.trim() || ''
  const inviteDriven =
    Boolean(inviteToken) || nextPath.startsWith('/invite/')

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
      'first_name, last_name, nickname, notification_email_invites, notification_email_study_activity, account_setup_completed_at'
    )
    .eq('id', user.id)
    .maybeSingle()

  return (
    <div className="mx-auto max-w-2xl space-y-8 px-4 py-10">
      <div>
        <p className="text-sm font-medium text-muted-foreground">Welcome</p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight text-foreground">
          Set up your account
        </h1>
        <p className="mt-2 text-muted-foreground">
          {inviteDriven ? (
            <>
              Finish getting started after your invitation: set a password, enter your first and
              last name (and optional nickname), then choose notification preferences. You need a
              password and legal name on file before you can accept the invite in the app.
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
        userEmail={user.email ?? ''}
        initialFirstName={profile?.first_name ?? null}
        initialLastName={profile?.last_name ?? null}
        initialNickname={profile?.nickname ?? null}
        initialEmailInvites={profile?.notification_email_invites ?? true}
        initialEmailStudy={profile?.notification_email_study_activity ?? true}
      />

      {!inviteDriven ? (
        <div className="flex justify-center border-t pt-6">
          <Button variant="ghost" size="sm" asChild>
            <Link href={nextPath}>Skip for now</Link>
          </Button>
        </div>
      ) : null}
    </div>
  )
}
