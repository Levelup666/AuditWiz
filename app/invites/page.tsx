import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Mail } from 'lucide-react'

export default async function InvitesPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/auth/signin')
  }

  const { data: studyInvites } = await supabase
    .from('study_member_invites')
    .select('id, study_id, email, role, invited_at, expires_at, study:studies(id, title)')
    .is('accepted_at', null)
    .gt('expires_at', new Date().toISOString())
    .order('invited_at', { ascending: false })

  const { data: institutionInvites } = await supabase
    .from('institution_invites')
    .select('id, institution_id, email, role, invited_at, expires_at, institution:institutions(id, name)')
    .is('accepted_at', null)
    .gt('expires_at', new Date().toISOString())
    .order('invited_at', { ascending: false })

  const hasAnyInvites =
    (studyInvites && studyInvites.length > 0) || (institutionInvites && institutionInvites.length > 0)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Pending Invites</h1>
        <p className="mt-2 text-gray-600">
          When you are signed in, <strong>accept study and institution invites here</strong>—you do
          not need the original email link. Email links are most useful for people who still need to
          create an account; you may still receive email reminders about pending invites when outbound
          mail is configured (e.g. Resend).
        </p>
      </div>

      {!hasAnyInvites ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Mail className="h-12 w-12 text-muted-foreground" />
            <p className="mt-4 text-muted-foreground">No pending invites</p>
            <Button asChild className="mt-4">
              <Link href="/studies">Go to Studies</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {institutionInvites && institutionInvites.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Institution Invites</CardTitle>
                <CardDescription>Invitations to join institutions</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {institutionInvites.map((inv) => {
                  const inst = inv.institution as unknown as { id: string; name: string } | null
                  return (
                    <div
                      key={inv.id}
                      className="flex items-center justify-between rounded-lg border p-4"
                    >
                      <div>
                        <p className="font-medium">{inst?.name ?? 'Institution'}</p>
                        <p className="text-sm text-muted-foreground">
                          Role: {inv.role} · Expires {new Date(inv.expires_at).toLocaleDateString()}
                        </p>
                      </div>
                      <Button asChild>
                        <Link href={`/invites/institution/${inv.id}`}>View</Link>
                      </Button>
                    </div>
                  )
                })}
              </CardContent>
            </Card>
          )}

          {studyInvites && studyInvites.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Study Invites</CardTitle>
                <CardDescription>Invitations to join studies</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {studyInvites.map((inv) => {
                  const study = inv.study as unknown as { id: string; title: string } | null
                  return (
                    <div
                      key={inv.id}
                      className="flex items-center justify-between rounded-lg border p-4"
                    >
                      <div>
                        <p className="font-medium">{study?.title ?? 'Study'}</p>
                        <p className="text-sm text-muted-foreground">
                          Role: {inv.role} · Expires {new Date(inv.expires_at).toLocaleDateString()}
                        </p>
                      </div>
                      <Button asChild>
                        <Link href={`/invites/study/${inv.id}`}>View</Link>
                      </Button>
                    </div>
                  )
                })}
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  )
}
