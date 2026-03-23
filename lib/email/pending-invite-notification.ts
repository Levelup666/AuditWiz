/**
 * Notify users about pending invites (study or institution).
 * Uses Resend when RESEND_API_KEY is set; otherwise logs in development only.
 */

function appBaseUrl(): string {
  if (process.env.NEXT_PUBLIC_APP_URL) {
    return process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, '')
  }
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`
  }
  return 'http://localhost:3000'
}

export type PendingInviteEmailKind = 'study' | 'institution'

export async function sendPendingInviteEmail(params: {
  to: string
  kind: PendingInviteEmailKind
  contextLabel: string
}): Promise<void> {
  const { to, kind, contextLabel } = params
  const base = appBaseUrl()
  const invitesUrl = `${base}/invites`
  const subject =
    kind === 'study'
      ? `Pending study invite: ${contextLabel}`
      : `Pending institution invite: ${contextLabel}`
  const text = `You have a pending ${kind} invitation on AuditWiz (${contextLabel}).

Sign in to your account and open your Invites page to accept:
${invitesUrl}

If you do not yet have an account, use the link from your original invitation email to sign up, then visit Invites after signing in.`

  const apiKey = process.env.RESEND_API_KEY
  const from = process.env.RESEND_FROM_EMAIL || 'AuditWiz <onboarding@resend.dev>'

  if (!apiKey) {
    if (process.env.NODE_ENV === 'development') {
      console.info('[pending-invite-email] (skipped — no RESEND_API_KEY)', { to, subject })
    }
    return
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject,
      text,
    }),
  })

  if (!res.ok) {
    const body = await res.text()
    console.error('[pending-invite-email] Resend error', res.status, body)
  }
}
