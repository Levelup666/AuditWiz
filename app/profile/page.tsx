import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import OrcidBadge from '@/components/profile/orcid-badge'
import LinkOrcidForm from '@/components/profile/link-orcid-form'
import { formatMemberListName } from '@/lib/profile/member-display-name'

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
      'orcid_id, orcid_verified, orcid_affiliation_snapshot, display_name, first_name, last_name, nickname'
    )
    .eq('id', userId)
    .maybeSingle()

  const { data: identities } = await supabase
    .from('user_identities')
    .select('provider, provider_id, verified, linked_at')
    .eq('user_id', userId)
    .is('revoked_at', null)

  const hasOrcid = Boolean(profile?.orcid_id)

  const listLabel = profile
    ? formatMemberListName(
        {
          nickname: profile.nickname,
          first_name: profile.first_name,
          last_name: profile.last_name,
          display_name: profile.display_name,
        },
        { userId }
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
            <p>
              <span className="text-gray-600">Email:</span> {user!.email ?? '—'}
            </p>
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

      <Card>
        <CardHeader>
          <CardTitle>ORCID</CardTitle>
          <CardDescription>
            Link your ORCID for verified attribution. Only one ORCID per account.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {hasOrcid ? (
            <div className="flex items-center gap-2">
              <OrcidBadge
                orcidId={profile!.orcid_id!}
                verified={profile!.orcid_verified}
                showId
              />
              <span className="text-sm text-gray-500">Linked</span>
            </div>
          ) : (
            <LinkOrcidForm />
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
