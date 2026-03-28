import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import AcceptInstitutionInviteButton from './accept-button'

interface PageProps {
  params: Promise<{ inviteId: string }>
}

export default async function AcceptInstitutionInvitePage({ params }: PageProps) {
  const { inviteId } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect(
      `/auth/signin?redirectedFrom=${encodeURIComponent(`/invites/institution/${inviteId}`)}&inviteNotice=${encodeURIComponent('Sign in to view this invite. If you were emailed a link, open that link for the best experience.')}`
    )
  }

  const { data: invite, error } = await supabase
    .from('institution_invites')
    .select(`
      id,
      institution_id,
      email,
      role,
      invited_at,
      expires_at,
      accepted_at,
      revoked_at,
      institution:institutions(id, name, slug)
    `)
    .eq('id', inviteId)
    .single()

  if (error || !invite) {
    notFound()
  }

  if (invite.revoked_at) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle>Invite revoked</CardTitle>
            <CardDescription>This invitation is no longer valid.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" asChild>
              <Link href="/studies">Go to Dashboard</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (invite.accepted_at) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle>Invite already accepted</CardTitle>
            <CardDescription>
              This invite has already been accepted. You can view the institution from your dashboard.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link href="/institutions">Go to Institutions</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (new Date(invite.expires_at) <= new Date()) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle>Invite expired</CardTitle>
            <CardDescription>
              This invite has expired. Please ask the institution admin to send a new invite.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline">
              <Link href="/studies">Go to Dashboard</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  const userEmail = user.email?.toLowerCase()
  const inviteEmail = invite.email?.toLowerCase()
  if (userEmail !== inviteEmail) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle>Wrong account</CardTitle>
            <CardDescription>
              This invite was sent to {invite.email}. You are signed in as {user.email}. Please sign in
              with the invited email address to accept.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" asChild>
              <Link href="/auth/signin">Sign in with different account</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  const institution = invite.institution as unknown as { id: string; name: string; slug: string } | null
  if (!institution) {
    notFound()
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <Card className="max-w-md">
        <CardHeader>
          <CardTitle>Join {institution.name}</CardTitle>
          <CardDescription>
            You have been invited to join {institution.name} as a {invite.role}. Accept to become a
            member. You will not automatically get access to studies; an admin will add you to
            specific studies as needed.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex gap-2">
          <AcceptInstitutionInviteButton inviteId={inviteId} institutionId={institution.id} role={invite.role} />
          <Button variant="outline" asChild>
            <Link href="/studies">Decline</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
