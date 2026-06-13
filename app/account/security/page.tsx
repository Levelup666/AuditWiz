import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import AccountSecurityForm from '@/components/account/account-security-form'
import { hasEmailPasswordIdentity } from '@/lib/auth/is-orcid-auth'
import {
  isPasswordRotationExpired,
  needsPasswordRotationSetup,
  userSubjectToPasswordPolicy,
} from '@/lib/auth/password-policy'

interface SecurityPageProps {
  searchParams: Promise<{
    reason?: string
    next?: string
  }>
}

export default async function AccountSecurityPage({ searchParams }: SecurityPageProps) {
  const { reason, next: nextParam } = await searchParams
  const nextPath = nextParam?.startsWith('/') ? nextParam : undefined
  const isGateMode = reason === 'password_expired' || reason === 'rotation_required'
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/auth/signin?redirectedFrom=/account/security')
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select(
      'password_policy_legacy, password_rotation_days, password_last_changed_at, orcid_email_locked'
    )
    .eq('id', user.id)
    .maybeSingle()

  const canManagePassword = hasEmailPasswordIdentity(user)
  const subjectToPolicy = userSubjectToPasswordPolicy(user, profile)

  if (!canManagePassword && !subjectToPolicy) {
    redirect('/profile')
  }

  const passwordExpired =
    reason === 'password_expired' ||
    (subjectToPolicy &&
      isPasswordRotationExpired({
        passwordLastChangedAt: profile?.password_last_changed_at,
        rotationDays: profile?.password_rotation_days,
      }))
  const rotationRequired =
    reason === 'rotation_required' || (subjectToPolicy && needsPasswordRotationSetup(profile, user))

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-10">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">
            {isGateMode ? 'Security check required' : 'Account security'}
          </h1>
          <p className="mt-2 text-muted-foreground">
            {isGateMode
              ? 'Update your password settings below to continue into the app.'
              : 'Manage your password and how often you change it.'}
          </p>
        </div>
        {!isGateMode ? (
          <Button variant="outline" asChild>
            <Link href={nextPath ?? '/profile'}>Back</Link>
          </Button>
        ) : null}
      </div>

      <AccountSecurityForm
        userEmail={user.email ?? ''}
        passwordPolicyLegacy={Boolean(profile?.password_policy_legacy)}
        subjectToPolicy={subjectToPolicy}
        initialRotationDays={profile?.password_rotation_days ?? null}
        passwordExpired={passwordExpired}
        rotationRequired={rotationRequired}
        nextPath={nextPath}
        isGateMode={isGateMode}
      />
    </div>
  )
}
