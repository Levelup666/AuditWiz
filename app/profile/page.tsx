import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import OrcidBadge from '@/components/profile/orcid-badge'
import { OrcidOAuthButton } from '@/components/auth/orcid-oauth-button'
import { formatMemberListName } from '@/lib/profile/member-display-name'
import { isOrcidPrimaryAccount, userSignedInViaOrcid } from '@/lib/auth/is-orcid-auth'
import { userNeedsOrcidEmailCapture } from '@/lib/auth/orcid-email-requirements'

export default async function ProfilePage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/auth/signin')
  }
  const userId = user!.id

  const { data: profile } = await supabase
    .from('profiles')
    .select(
      'orcid_id, orcid_verified, orcid_email_locked, orcid_affiliation_snapshot, display_name, first_name, last_name, nickname'
    )
    .eq('id', userId)
    .maybeSingle()

  if (userNeedsOrcidEmailCapture(user, profile)) {
    redirect(`/account/setup?orcid_email_required=1&next=${encodeURIComponent('/profile')}`)
  }

  const { data: identities } = await supabase
    .from('user_identities')
    .select('provider, provider_id, verified, linked_at')
    .eq('user_id', userId)
    .is('revoked_at', null)

  const hasOrcid = Boolean(profile?.orcid_id)
  const orcidVerified = Boolean(profile?.orcid_verified)

  const signedInViaOrcid = userSignedInViaOrcid(user!)
  const orcidPrimary = isOrcidPrimaryAccount(user!, profile)
  const orcidEmailLocked = Boolean(profile?.orcid_email_locked)

  const listLabel = profile
    ? formatMemberListName(
        {
          nickname: profile.nickname,
          first_name: profile.first_name,
          last_name: profile.last_name,
          display_name: profile.display_name,
        },
        undefined
      )
    : null

  return (
    <div className="container max-w-2xl py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Profile</h1>
        <p className="text-gray-600 mt-1">
          Identity and ORCID for attribution
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Account</CardTitle>
          <CardDescription>Email and how you appear to collaborators</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <div className="space-y-2">
            <p className="flex flex-wrap items-center gap-2">
              <span className="text-gray-600">Email:</span>
              <span>{user!.email ?? '—'}</span>
              {orcidEmailLocked && (
                <span className="text-xs text-muted-foreground">(from ORCID, cannot be changed)</span>
              )}
            </p>
            {orcidEmailLocked && (
              <p className="text-xs text-muted-foreground">
                Contact email is managed through your ORCID account and used for invites and
                notifications.
              </p>
            )}
            {hasOrcid && (
              <p className="flex flex-wrap items-center gap-2">
                <span className="text-gray-600">ORCID iD:</span>
                <OrcidBadge orcidId={profile!.orcid_id!} verified={orcidVerified} />
                <Link
                  href={`https://orcid.org/${profile!.orcid_id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono text-sm hover:underline"
                >
                  {profile!.orcid_id}
                </Link>
                {orcidVerified && (
                  <span className="text-xs font-medium text-green-700">verified</span>
                )}
                {signedInViaOrcid && (
                  <span className="rounded-full border border-[#a6ce39] bg-[#a6ce39]/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#5b7a14]">
                    Signed in via ORCID
                  </span>
                )}
              </p>
            )}
            {profile?.first_name != null && profile.first_name !== '' && (
              <p>
                <span className="text-gray-600">First name:</span> {profile.first_name}
              </p>
            )}
            {profile?.last_name != null && profile.last_name !== '' && (
              <p>
                <span className="text-gray-600">Last name:</span> {profile.last_name}
              </p>
            )}
            {profile?.nickname != null && profile.nickname.trim() !== '' && (
              <p>
                <span className="text-gray-600">Nickname:</span> {profile.nickname}
              </p>
            )}
            {listLabel && listLabel !== 'Unknown' && (
              <p className="text-muted-foreground">
                <span className="text-gray-600">Shown in member lists:</span> {listLabel}
                {profile?.nickname?.trim() ? (
                  <span className="block text-xs mt-1">
                    Your nickname is shown instead of the default &quot;First L.&quot; format when set.
                  </span>
                ) : null}
              </p>
            )}
          </div>
          <p>
            <Link
              href="/account/setup?next=/profile"
              className="font-medium text-primary underline-offset-4 hover:underline"
            >
              Account, name &amp; notification settings
            </Link>
          </p>
        </CardContent>
      </Card>

      {(hasOrcid && orcidPrimary) || signedInViaOrcid ? (
        <Card>
          <CardHeader>
            <CardTitle>Sign-in credential</CardTitle>
            <CardDescription>
              You sign in with ORCID. Your ORCID iD is your verified identity; contact email is
              managed separately for invites and notifications.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p className="flex flex-wrap items-center gap-2">
              <span className="text-gray-600">Provider:</span>
              <span className="font-medium">ORCID</span>
            </p>
            {hasOrcid ? (
              <p className="flex flex-wrap items-center gap-2">
                <span className="text-gray-600">ORCID iD:</span>
                <OrcidBadge orcidId={profile!.orcid_id!} verified={orcidVerified} />
                <Link
                  href={`https://orcid.org/${profile!.orcid_id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono hover:underline"
                >
                  {profile!.orcid_id}
                </Link>
              </p>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            ORCID
            {signedInViaOrcid && (
              <span className="rounded-full border border-[#a6ce39] bg-[#a6ce39]/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#5b7a14]">
                Signed in via ORCID
              </span>
            )}
          </CardTitle>
          <CardDescription>
            {hasOrcid
              ? 'Your ORCID identity is linked to this account and used for attribution.'
              : 'Sign in with ORCID at ORCID.org to verify your iD. Only one ORCID per account.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {hasOrcid ? (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <OrcidBadge orcidId={profile!.orcid_id!} verified={orcidVerified} showId />
                <span className="text-sm text-gray-500">
                  {orcidVerified ? 'Linked & verified' : 'Linked'}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                ORCID iD is immutable once linked. Contact support if you need to change it.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <OrcidOAuthButton mode="link" className="w-full max-w-xs" />
              <p className="text-xs text-muted-foreground max-w-md">
                You will be redirected to ORCID to approve access, then returned here.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {identities && identities.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Linked identities</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="text-sm space-y-1">
              {identities.map((i) => (
                <li key={`${i.provider}-${i.provider_id}`}>
                  {i.provider}: {i.provider_id} {i.verified && '(verified)'}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
