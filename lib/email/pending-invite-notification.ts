/**
 * Notify users about pending invites (study or institution).
 * 1) When supabaseAdmin is provided, tries auth.admin.inviteUserByEmail (same mailer as sign-up).
 * 2) Otherwise or if that user already exists, uses Resend when RESEND_API_KEY is set.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { safeAppPath } from '@/lib/invites/safe-redirect'

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

export type PendingInviteEmailResult = {
  sent: boolean
  /** How the message was delivered when sent is true */
  channel?: 'supabase' | 'resend'
  reason?: 'no_resend_api_key' | 'resend_error'
  /**
   * When sent is false, reason is no_resend_api_key: why we fell through to needing Resend.
   * Used for accurate admin UI copy (do not assume "user already exists").
   */
  noResendDetail?:
    | 'supabase_said_user_exists'
    | 'supabase_invite_failed'
    | 'supabase_admin_not_provided'
  /** Last Auth admin error when inviteUserByEmail did not succeed (safe to surface; no PII). */
  supabaseAuthError?: { code?: string; status?: number }
}

/** Shared API/UI fields after sendPendingInviteEmail (institution + study invite routes). */
export function inviteEmailDispatchFields(emailResult: PendingInviteEmailResult): {
  email_dispatched: boolean
  email_channel: 'supabase' | 'resend' | null
  email_dispatch_message: string | undefined
  email_dispatch_detail: string | null
  email_supabase_error: { code?: string; status?: number } | null
} {
  const emailDispatchMessage = emailResult.sent
    ? emailResult.channel === 'supabase'
      ? 'An invite link was sent via Supabase Auth. They will land on account setup first, then can open Invites to accept.'
      : undefined
    : emailResult.reason === 'no_resend_api_key'
      ? emailResult.noResendDetail === 'supabase_said_user_exists'
        ? 'No email was sent: this address already has an Auth user. Set RESEND_API_KEY to deliver a copy, or ask them to sign in and open Invites. The invite is saved.'
        : emailResult.noResendDetail === 'supabase_invite_failed'
          ? 'No email was sent: Supabase Auth could not send the invite (check Dashboard → Auth → URL configuration for redirect URLs, and SMTP/custom SMTP). Set RESEND_API_KEY as a fallback. The invite is saved—share the link from your records if needed.'
          : 'No email was sent: Resend is not configured (set RESEND_API_KEY). The invite is saved.'
      : 'The invite is saved, but Resend rejected the message. Check server logs and RESEND_FROM_EMAIL / domain verification.'

  return {
    email_dispatched: emailResult.sent,
    email_channel: emailResult.channel ?? null,
    email_dispatch_message: emailDispatchMessage,
    email_dispatch_detail: emailResult.noResendDetail ?? null,
    email_supabase_error: emailResult.supabaseAuthError ?? null,
  }
}

function isSupabaseAlreadyRegisteredError(
  err: { message?: string; code?: string }
): boolean {
  const msg = (err.message || '').toLowerCase()
  const code = String(err.code || '')
  return (
    msg.includes('already been registered') ||
    msg.includes('already registered') ||
    msg.includes('user already exists') ||
    msg.includes('email address is already') ||
    msg.includes('duplicate') ||
    code === 'email_exists'
  )
}

export async function sendPendingInviteEmail(params: {
  to: string
  kind: PendingInviteEmailKind
  contextLabel: string
  /** Opaque invite token (raw). Email and redirects use /invite/[token]. */
  inviteRawToken?: string
  /** Service-role client: enables Supabase invite email (same provider as sign-up confirmation). */
  supabaseAdmin?: SupabaseClient
}): Promise<PendingInviteEmailResult> {
  const { to, kind, contextLabel, supabaseAdmin, inviteRawToken } = params
  const base = appBaseUrl()
  const invitePath = inviteRawToken ? `/invite/${inviteRawToken}` : null
  const inviteUrl = invitePath ? `${base}${invitePath}` : `${base}/invites`
  const callbackNext = invitePath
    ? `/auth/callback?next=${encodeURIComponent(invitePath)}`
    : `/auth/callback?next=${encodeURIComponent('/account/setup?next=/invites')}`
  const redirectTo = `${base}${callbackNext.startsWith('/') ? callbackNext : '/' + callbackNext}`

  const setupUrl = invitePath
    ? `${base}/account/setup?next=${encodeURIComponent(invitePath)}&invite=${encodeURIComponent(inviteRawToken!)}`
    : `${base}/account/setup?next=${encodeURIComponent(safeAppPath('/invites'))}`

  const invitesUrl = `${base}/invites`
  const subject =
    kind === 'study'
      ? `Pending study invite: ${contextLabel}`
      : `Pending institution invite: ${contextLabel}`

  const text = invitePath
    ? `You have a pending ${kind} invitation on AuditWiz (${contextLabel}).

Open this link to review and accept the invitation (sign in or create an account if needed):
${inviteUrl}

After you can sign in, you can also use Invites in the app:
${invitesUrl}

First-time setup (password and preferences) if you were just invited:
${setupUrl}`
    : `You have a pending ${kind} invitation on AuditWiz (${contextLabel}).

After signing in, finish account setup (password and notification preferences), then open Invites:
${setupUrl}

If you already completed setup, go directly to Invites:
${invitesUrl}`

  let noResendDetail: NonNullable<PendingInviteEmailResult['noResendDetail']> =
    'supabase_admin_not_provided'
  let supabaseAuthError: PendingInviteEmailResult['supabaseAuthError']

  function authErr(e: { code?: string; status?: number; message?: string }) {
    return {
      code: typeof e.code === 'string' ? e.code : undefined,
      status: typeof e.status === 'number' ? e.status : undefined,
    }
  }

  if (supabaseAdmin) {
    const minimalRedirect = `${base}/auth/callback`
    const tryInvite = async (rt: string) =>
      supabaseAdmin.auth.admin.inviteUserByEmail(to, { redirectTo: rt })

    const { error: firstErr } = await tryInvite(redirectTo)
    if (!firstErr) {
      return { sent: true, channel: 'supabase' }
    }

    supabaseAuthError = authErr(firstErr as { code?: string; status?: number; message?: string })

    if (isSupabaseAlreadyRegisteredError(firstErr)) {
      noResendDetail = 'supabase_said_user_exists'
    } else if (minimalRedirect !== redirectTo) {
      console.warn(
        '[pending-invite-email] inviteUserByEmail failed; retrying with minimal redirectTo (callback only):',
        (firstErr as { message?: string }).message,
        (firstErr as { code?: string }).code
      )
      const { error: secondErr } = await tryInvite(minimalRedirect)
      if (!secondErr) {
        return { sent: true, channel: 'supabase' }
      }
      supabaseAuthError = authErr(secondErr as { code?: string; status?: number; message?: string })
      if (isSupabaseAlreadyRegisteredError(secondErr)) {
        noResendDetail = 'supabase_said_user_exists'
      } else {
        noResendDetail = 'supabase_invite_failed'
        console.warn(
          '[pending-invite-email] inviteUserByEmail failed after retry; trying Resend if configured:',
          (secondErr as { message?: string }).message,
          (secondErr as { code?: string }).code
        )
      }
    } else {
      noResendDetail = 'supabase_invite_failed'
      console.warn(
        '[pending-invite-email] inviteUserByEmail failed; trying Resend if configured:',
        (firstErr as { message?: string }).message,
        (firstErr as { code?: string }).code
      )
    }
  }

  const apiKey = process.env.RESEND_API_KEY
  const from = process.env.RESEND_FROM_EMAIL || 'AuditWiz <onboarding@resend.dev>'

  if (!apiKey) {
    if (process.env.NODE_ENV === 'development') {
      console.info('[pending-invite-email] (skipped — no RESEND_API_KEY)', { to, subject })
    }
    return {
      sent: false,
      reason: 'no_resend_api_key',
      noResendDetail,
      supabaseAuthError,
    }
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
    return { sent: false, reason: 'resend_error', supabaseAuthError }
  }

  return { sent: true, channel: 'resend' }
}
