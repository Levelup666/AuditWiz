import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { hashInviteToken } from '@/lib/invites/token'
import {
  lookupInviteByTokenHash,
  maskEmail,
  type ResolvedInvite,
} from '@/lib/invites/lookup-invite-by-token'
import { recordInviteOpenedIfFirst } from '@/lib/invites/record-invite-opened'
import { recordInviteExpiredAuditIfFirst } from '@/lib/invites/record-invite-expired'
import { findUserIdByEmail } from '@/lib/supabase/find-user-by-email'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import InviteActions from './invite-actions'

interface PageProps {
  params: Promise<{ token: string }>
}

function inviteeMatchesSession(
  resolved: ResolvedInvite,
  userEmail: string | undefined,
  orcidIds: string[]
): boolean {
  if (resolved.kind === 'institution' || resolved.kind === 'audit_engagement') {
    const ie = resolved.email?.toLowerCase()
    return Boolean(userEmail && ie && userEmail.toLowerCase() === ie)
  }
  const em = userEmail?.toLowerCase()
  if (resolved.email && em && resolved.email.toLowerCase() === em) return true
  if (resolved.orcidId && orcidIds.includes(resolved.orcidId)) return true
  return false
}

export default async function InviteResolutionPage({ params }: PageProps) {
  const { token: rawToken } = await params
  if (!rawToken?.trim()) notFound()

  const admin = createAdminClient()
  const tokenHash = hashInviteToken(rawToken.trim())
  const resolved = await lookupInviteByTokenHash(admin, tokenHash)

  if (!resolved) {
    notFound()
  }

  const now = new Date()
  const isExpired = new Date(resolved.expiresAt) <= now

  if (isExpired) {
    await recordInviteExpiredAuditIfFirst(admin, resolved)
    return (
      <div className="flex min-h-screen items-center justify-center px-4 py-12">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle>Invite expired</CardTitle>
            <CardDescription>
              This invitation is no longer valid. Ask the sender for a new invite if you still need
              access.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    )
  }

  if (resolved.revokedAt) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4 py-12">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle>Invite revoked</CardTitle>
            <CardDescription>This invitation was withdrawn and can no longer be used.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline">
              <Link href="/studies">Go to dashboard</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (resolved.acceptedAt) {
    const continueHref =
      resolved.kind === 'study'
        ? `/studies/${resolved.studyId}`
        : resolved.kind === 'audit_engagement'
          ? '/auditor'
          : '/institutions'
    return (
      <div className="flex min-h-screen items-center justify-center px-4 py-12">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle>Already accepted</CardTitle>
            <CardDescription>
              This invitation was already accepted. You can continue from your dashboard.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link href={continueHref}>Continue</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  await recordInviteOpenedIfFirst(admin, resolved)

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const title =
    resolved.kind === 'study'
      ? resolved.studyTitle || 'Study invitation'
      : resolved.kind === 'audit_engagement'
        ? `${resolved.institutionName ?? 'Institution'} — audit engagement`
        : resolved.institutionName || 'Institution invitation'

  const targetLabel =
    resolved.kind === 'study'
      ? 'Study'
      : resolved.kind === 'audit_engagement'
        ? 'Audit engagement'
        : 'Institution'
  const masked = maskEmail(resolved.email)

  let orcidIds: string[] = []
  if (user) {
    const { data: ids } = await supabase
      .from('user_identities')
      .select('provider_id')
      .eq('user_id', user.id)
      .eq('provider', 'orcid')
      .is('revoked_at', null)
    orcidIds = (ids || []).map((r) => r.provider_id)
  }

  const redirectBack = `/invite/${rawToken}`
  const signInHref = `/auth/signin?redirectedFrom=${encodeURIComponent(redirectBack)}&inviteNotice=${encodeURIComponent('This invitation is linked to your account. Please sign in to continue.')}`
  const signupEmail =
    resolved.kind === 'institution' ||
    resolved.kind === 'audit_engagement' ||
    resolved.email
      ? resolved.email || ''
      : ''
  const setupFirstReturn = `/account/setup?next=/invites&pending_invite=1`
  const signUpHref = `/auth/signup?redirectedFrom=${encodeURIComponent(setupFirstReturn)}${signupEmail ? `&email=${encodeURIComponent(signupEmail)}` : ''}`

  if (!user) {
    let accountExists = false
    if (resolved.email) {
      accountExists = Boolean(await findUserIdByEmail(admin, resolved.email))
    }

    return (
      <div className="flex min-h-screen items-center justify-center px-4 py-12">
        <Card className="max-w-lg">
          <CardHeader>
            <CardTitle>{title}</CardTitle>
            <CardDescription className="space-y-2">
              <span className="block">
                {targetLabel} invite · Role: <strong>{resolved.role}</strong>
              </span>
              {resolved.inviterDisplay && (
                <span className="block text-muted-foreground">Invited by {resolved.inviterDisplay}</span>
              )}
              {masked && (
                <span className="block">Recipient: {masked}</span>
              )}
              {!resolved.email && resolved.kind === 'study' && resolved.orcidId && (
                <span className="block">
                  This invite is tied to ORCID. Sign in with an account that has this ORCID linked.
                </span>
              )}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {accountExists && resolved.email && (
              <p className="text-sm text-muted-foreground">
                An account already exists for this email. Sign in to accept the invitation.
              </p>
            )}
            {!accountExists && resolved.email && (
              <p className="text-sm text-muted-foreground">
                No account yet for this email—create one with the same address. You will set your
                password and name on the next screen, then open <strong>Invites</strong> in the app
                to accept this invitation.
              </p>
            )}
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button asChild>
                <Link href={signInHref}>Sign in</Link>
              </Button>
              {resolved.email && (
                <Button asChild variant="outline">
                  <Link href={signUpHref}>Create account</Link>
                </Button>
              )}
            </div>
            <Button variant="ghost" asChild className="self-start">
              <Link href="/studies">Back to dashboard</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  const matches = inviteeMatchesSession(resolved, user.email ?? undefined, orcidIds)

  const { data: inviteeProfile } = await supabase
    .from('profiles')
    .select('account_setup_completed_at, first_name, last_name')
    .eq('id', user.id)
    .maybeSingle()

  const setupRequired =
    !inviteeProfile?.account_setup_completed_at ||
    !inviteeProfile.first_name?.trim() ||
    !inviteeProfile.last_name?.trim()

  if (matches && setupRequired) {
    redirect('/account/setup?next=/invites&pending_invite=1')
  }

  if (!matches) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4 py-12">
        <Card className="max-w-lg">
          <CardHeader>
            <CardTitle>Wrong account</CardTitle>
            <CardDescription>
              This invite is intended for a different account
              {masked ? ` (${masked})` : resolved.kind === 'study' && resolved.orcidId ? ' (ORCID)' : ''}. Sign out and sign in with
              the invited email or ORCID.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <InviteActions rawToken={rawToken} canAccept={false} />
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-12">
      <Card className="max-w-lg">
        <CardHeader>
          <CardTitle>Accept invitation</CardTitle>
          <CardDescription className="space-y-2">
            <span className="block font-medium text-foreground">{title}</span>
            <span className="block">
              {targetLabel} · Role: <strong>{resolved.role}</strong>
            </span>
            {resolved.inviterDisplay && (
              <span className="block text-muted-foreground">Invited by {resolved.inviterDisplay}</span>
            )}
            {resolved.kind === 'audit_engagement' && (
              <span className="mt-3 block rounded-md border border-amber-200 bg-amber-50/60 p-3 text-xs leading-relaxed text-amber-900">
                <strong className="block text-sm">Read-only audit engagement</strong>
                Scope:{' '}
                {resolved.scope === 'institution_wide'
                  ? 'every study under this institution'
                  : 'specific studies issued by the institution admin'}
                . Window: {new Date(resolved.startsAt).toLocaleString()} –{' '}
                {new Date(resolved.expiresAt).toLocaleString()}.
                {resolved.purpose ? (
                  <>
                    {' '}
                    Purpose: <em>{resolved.purpose}</em>.
                  </>
                ) : null}{' '}
                You will be able to read records, signatures, anchors, and audit logs covered by
                this engagement. You cannot edit, sign, approve, or anchor anything.
              </span>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <InviteActions rawToken={rawToken} canAccept={true} />
        </CardContent>
      </Card>
    </div>
  )
}
