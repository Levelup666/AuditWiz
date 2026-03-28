import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import AcceptStudyInviteButton from './accept-button'

interface PageProps {
  params: Promise<{ inviteId: string }>
}

export default async function AcceptStudyInvitePage({ params }: PageProps) {
  const { inviteId } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect(
      `/auth/signin?redirectedFrom=${encodeURIComponent(`/invites/study/${inviteId}`)}&inviteNotice=${encodeURIComponent('Sign in to view this invite. If you were emailed a link, open that link for the best experience.')}`
    )
  }

  const { data: invite, error } = await supabase
    .from('study_member_invites')
    .select(`
      id,
      study_id,
      email,
      orcid_id,
      role,
      invited_at,
      expires_at,
      accepted_at,
      revoked_at,
      study:studies(id, title)
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
              This invite has already been accepted. You can view the study from your dashboard.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link href={`/studies/${invite.study_id}`}>Go to Study</Link>
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
              This invite has expired. Please ask the study admin to send a new invite.
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

  const study = invite.study as unknown as { id: string; title: string } | null
  if (!study) {
    notFound()
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <Card className="max-w-md">
        <CardHeader>
          <CardTitle>Join {study.title}</CardTitle>
          <CardDescription>
            You have been invited to join this study as a {invite.role}. Accept to get access.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex gap-2">
          <AcceptStudyInviteButton inviteId={inviteId} studyId={invite.study_id} />
          <Button variant="outline" asChild>
            <Link href="/studies">Decline</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
