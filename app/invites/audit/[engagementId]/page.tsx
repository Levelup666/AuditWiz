import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import AuditEngagementDecisionActions from '@/components/invites/audit-engagement-decision-actions'
import { getAuditorReferenceIdPolicy } from '@/lib/auditor/auditor-credential-policy'

interface PageProps {
  params: Promise<{ engagementId: string }>
}

export default async function AcceptAuditEngagementInvitePage({ params }: PageProps) {
  const { engagementId } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect(
      `/auth/signin?redirectedFrom=${encodeURIComponent(`/invites/audit/${engagementId}`)}&inviteNotice=${encodeURIComponent('Sign in to view this audit engagement invite.')}`
    )
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('account_setup_completed_at, first_name, last_name')
    .eq('id', user.id)
    .maybeSingle()

  if (
    !profile?.account_setup_completed_at ||
    !profile.first_name?.trim() ||
    !profile.last_name?.trim()
  ) {
    const setupNext = `/invites/audit/${engagementId}`
    redirect(
      `/account/setup?next=${encodeURIComponent(setupNext)}&auditor_invite=1`
    )
  }

  const { data: engagement, error } = await supabase
    .from('audit_engagements')
    .select(
      `id, institution_id, auditor_email, scope, purpose, starts_at, expires_at,
       accepted_at, revoked_at,
       engagement_letter_file_name, engagement_letter_file_hash, engagement_letter_uploaded_at,
       institution:institutions(id, name, metadata)`
    )
    .eq('id', engagementId)
    .single()

  if (error || !engagement) {
    notFound()
  }

  const userEmailNorm = user.email?.trim().toLowerCase() ?? ''
  const inviteEmailNorm = engagement.auditor_email?.trim().toLowerCase() ?? ''
  if (!userEmailNorm || userEmailNorm !== inviteEmailNorm) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle>Wrong account</CardTitle>
            <CardDescription>
              This audit engagement was issued to a different email address. Sign out and sign in
              with the invited email.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" asChild>
              <Link href="/invites">Back to invites</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  const inst = engagement.institution as
    | { id: string; name: string; metadata?: unknown }
    | { id: string; name: string; metadata?: unknown }[]
    | null
  const institution = Array.isArray(inst) ? inst[0] : inst
  const institutionName = institution?.name
  const refPolicy = getAuditorReferenceIdPolicy(institution?.metadata ?? null)

  if (engagement.revoked_at) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle>Engagement revoked</CardTitle>
            <CardDescription>This audit engagement is no longer available.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" asChild>
              <Link href="/invites">Back to invites</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (engagement.accepted_at) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle>Already accepted</CardTitle>
            <CardDescription>Open your auditor dashboard to view this engagement.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link href="/auditor">Go to auditor dashboard</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (new Date(engagement.expires_at) <= new Date()) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle>Engagement expired</CardTitle>
            <CardDescription>Ask the institution administrator for a new audit engagement.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" asChild>
              <Link href="/invites">Back to invites</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  const scopeLabel =
    engagement.scope === 'institution_wide'
      ? 'Institution-wide (all studies)'
      : 'Specific studies'

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-12">
      <Card className="max-w-lg">
        <CardHeader>
          <CardTitle>{institutionName ?? 'Institution'} — audit engagement</CardTitle>
          <CardDescription className="space-y-2">
            <span className="block">Read-only audit access · Role: auditor</span>
            <span className="block text-muted-foreground">Scope: {scopeLabel}</span>
            {engagement.purpose ? (
              <span className="block text-muted-foreground">Purpose: {engagement.purpose}</span>
            ) : null}
            <span className="block text-muted-foreground">
              Window: {new Date(engagement.starts_at).toLocaleString()} –{' '}
              {new Date(engagement.expires_at).toLocaleString()}
            </span>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-md border border-amber-200 bg-amber-50/60 p-3 text-xs leading-relaxed text-amber-900">
            You will have read-only access to records, signatures, anchors, and audit logs in scope.
            You cannot edit, sign, approve, or anchor anything.
          </div>
          <AuditEngagementDecisionActions
            engagementId={engagement.id}
            institutionId={engagement.institution_id}
            referencePolicy={{
              label: refPolicy.label,
              required: refPolicy.required,
              formatHint: refPolicy.format,
            }}
            engagementLetter={
              engagement.engagement_letter_file_hash
                ? {
                    fileName: engagement.engagement_letter_file_name ?? 'engagement-letter.pdf',
                    fileHash: engagement.engagement_letter_file_hash,
                    uploadedAt: engagement.engagement_letter_uploaded_at,
                  }
                : null
            }
          />
        </CardContent>
      </Card>
    </div>
  )
}
