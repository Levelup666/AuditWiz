/**
 * Transactional email via Postmark Server API.
 * Auth invite emails still use Supabase Auth SMTP (e.g. Postmark SMTP in dashboard).
 */

export type TransactionalEmailResult = {
  sent: boolean
  reason?: 'no_postmark_token' | 'no_from_address' | 'postmark_error'
}

export function transactionalFromAddress(): string | null {
  const from = process.env.POSTMARK_FROM_EMAIL?.trim()
  return from || null
}

function normalizeRecipients(to: string | string[]): string {
  const list = (Array.isArray(to) ? to : [to]).map((e) => e.trim()).filter(Boolean)
  return list.join(', ')
}

export async function sendTransactionalEmail(params: {
  to: string | string[]
  subject: string
  text: string
}): Promise<TransactionalEmailResult> {
  const token = process.env.POSTMARK_SERVER_TOKEN?.trim()
  const from = transactionalFromAddress()
  const to = normalizeRecipients(params.to)

  if (!to) {
    return { sent: false, reason: 'postmark_error' }
  }

  if (!token) {
    if (process.env.NODE_ENV === 'development') {
      console.info('[transactional-email] skipped — no POSTMARK_SERVER_TOKEN', {
        to,
        subject: params.subject,
      })
    }
    return { sent: false, reason: 'no_postmark_token' }
  }

  if (!from) {
    if (process.env.NODE_ENV === 'development') {
      console.info('[transactional-email] skipped — no POSTMARK_FROM_EMAIL', {
        to,
        subject: params.subject,
      })
    }
    return { sent: false, reason: 'no_from_address' }
  }

  const res = await fetch('https://api.postmarkapp.com/email', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'X-Postmark-Server-Token': token,
    },
    body: JSON.stringify({
      From: from,
      To: to,
      Subject: params.subject,
      TextBody: params.text,
      MessageStream: 'outbound',
    }),
  })

  if (!res.ok) {
    const body = await res.text()
    console.error('[transactional-email] Postmark error', res.status, body)
    return { sent: false, reason: 'postmark_error' }
  }

  return { sent: true }
}
