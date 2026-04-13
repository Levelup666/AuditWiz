/**
 * Notify users about pending invites (study or institution).
 * 1) When supabaseAdmin is provided, tries auth.admin.inviteUserByEmail (same mailer as sign-up).
 * 2) Otherwise or if that user already exists, uses Resend when RESEND_API_KEY is set.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { safeAppPath } from '@/lib/invites/safe-redirect'
import { formatPendingInviteExpiryForEmail } from '@/lib/invites/pending-invite-expiry'

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

function truncateAuthMessage(msg: string, max = 400): string {
  const t = msg.replace(/\s+/g, ' ').trim()
  return t.length <= max ? t : `${t.slice(0, max)}…`
}

function supabaseInviteFailedUserMessage(
  supabaseAuthError: { code?: string; status?: number; message?: string } | null | undefined
): string {
  if (supabaseAuthError?.code === 'over_email_send_rate_limit') {
    return 'No email was sent: Supabase Auth is rate-limiting outbound email for this project (common after many invites or tests in a short window). Wait and retry, or configure custom SMTP in the Dashboard. Set RESEND_API_KEY to deliver via Resend instead. The invite is saved—share the link from your records if needed.'
  }
  const smtpHint =
    'If you use custom SMTP: open Supabase Dashboard → Project Settings → Auth → SMTP Settings, send a test email, and confirm the sender address/domain matches what your provider allows (SPF/DKIM), TLS mode matches the port (often 587 STARTTLS or 465 SSL), and credentials are correct.'
  return `No email was sent: Supabase Auth could not deliver the invite email (${smtpHint}). Also confirm Authentication → URL Configuration allows your app redirect URLs (e.g. …/auth/callback). Set RESEND_API_KEY in this app to fall back to Resend with the same invite link text. The invite is saved—share the link from your records if needed.`
}

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
    | 'existing_user_notify_no_resend'
  /** Last Auth admin error when inviteUserByEmail did not succeed (safe to surface; no PII). */
  supabaseAuthError?: { code?: string; status?: number; message?: string }
  /** Study email invites: refines admin toast copy (institution invites omit this). */
  studyInviteAudience?: 'new_email' | 'existing_auth_user'
}

/** Shared API/UI fields after sendPendingInviteEmail (institution + study invite routes). */
export function inviteEmailDispatchFields(emailResult: PendingInviteEmailResult): {
  email_dispatched: boolean
  email_channel: 'supabase' | 'resend' | null
  email_dispatch_message: string | undefined
  email_dispatch_detail: string | null
  email_supabase_error: { code?: string; status?: number; message?: string } | null
} {
  const audience = emailResult.studyInviteAudience

  const emailDispatchMessage = emailResult.sent
    ? audience === 'existing_auth_user'
      ? 'Pending invite created. We emailed them to sign in and open Invites to accept (direct link included in the message).'
      : emailResult.channel === 'supabase'
        ? 'An invite link was sent via Supabase Auth. They will land on account setup first, then can open Invites to accept.'
        : audience === 'new_email'
          ? 'Pending invite created. We emailed them an invitation link to sign up or sign in and complete setup.'
          : undefined
    : emailResult.reason === 'no_resend_api_key'
      ? emailResult.noResendDetail === 'existing_user_notify_no_resend'
        ? 'No email was sent: existing users are notified via Resend only for this flow. Set RESEND_API_KEY. The pending invite is saved—they can still accept from Invites when signed in.'
        : emailResult.noResendDetail === 'supabase_said_user_exists'
          ? 'No email was sent: this address already has an Auth user. Set RESEND_API_KEY to deliver a copy, or ask them to sign in and open Invites. The invite is saved.'
          : emailResult.noResendDetail === 'supabase_invite_failed'
            ? supabaseInviteFailedUserMessage(emailResult.supabaseAuthError)
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
  /** Matches DB `expires_at` — included in plain-text body for Supabase + Resend. */
  expiresAtIso?: string
  /** Service-role client: enables Supabase invite email (same provider as sign-up confirmation). */
  supabaseAdmin?: SupabaseClient
}): Promise<PendingInviteEmailResult> {
  const { to, kind, contextLabel, supabaseAdmin, inviteRawToken, expiresAtIso } = params
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

  const expiryLine = expiresAtIso ? formatPendingInviteExpiryForEmail(expiresAtIso) : ''
  const expiryNote = expiryLine ? `\n\n${expiryLine}` : ''

  const text = invitePath
    ? `You have a pending ${kind} invitation on AuditWiz (${contextLabel}).

Open this link to review and accept the invitation (sign in or create an account if needed):
${inviteUrl}

After you can sign in, you can also use Invites in the app:
${invitesUrl}

First-time setup (password and preferences) if you were just invited:
${setupUrl}${expiryNote}`
    : `You have a pending ${kind} invitation on AuditWiz (${contextLabel}).

After signing in, finish account setup (password and notification preferences), then open Invites:
${setupUrl}

If you already completed setup, go directly to Invites:
${invitesUrl}${expiryNote}`

  let noResendDetail: NonNullable<PendingInviteEmailResult['noResendDetail']> =
    'supabase_admin_not_provided'
  let supabaseAuthError: PendingInviteEmailResult['supabaseAuthError']

  function authErr(e: { code?: string; status?: number; message?: string }) {
    const rawMsg = typeof e.message === 'string' ? e.message : undefined
    return {
      code: typeof e.code === 'string' ? e.code : undefined,
      status: typeof e.status === 'number' ? e.status : undefined,
      message: rawMsg ? truncateAuthMessage(rawMsg) : undefined,
    }
  }

  if (supabaseAdmin) {
    const minimalRedirect = `${base}/auth/callback`
    const tryInvite = async (rt: string) =>
      supabaseAdmin.auth.admin.inviteUserByEmail(to, { redirectTo: rt })

    const { error: firstErr } = await tryInvite(redirectTo)
    if (firstErr) {
      console.warn('[pending-invite-email] inviteUserByEmail failed', {
        code: (firstErr as { code?: string }).code,
        message: (firstErr as { message?: string }).message,
      })
    }
    if (!firstErr) {
      return {
        sent: true,
        channel: 'supabase',
        ...(kind === 'study' ? { studyInviteAudience: 'new_email' as const } : {}),
      }
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
      if (secondErr) {
        console.warn('[pending-invite-email] inviteUserByEmail failed (minimal redirectTo)', {
          code: (secondErr as { code?: string }).code,
          message: (secondErr as { message?: string }).message,
        })
      }
      if (!secondErr) {
        return {
          sent: true,
          channel: 'supabase',
          ...(kind === 'study' ? { studyInviteAudience: 'new_email' as const } : {}),
        }
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

  return {
    sent: true,
    channel: 'resend',
    ...(kind === 'study' ? { studyInviteAudience: 'new_email' as const } : {}),
  }
}

/**
 * Email for an Auth user who already exists: no inviteUserByEmail (avoids "create account" UX).
 * Resend-only: sign in → Invites, plus optional /invite/{token} deep link.
 */
export async function sendExistingUserPendingInviteNotification(params: {
  to: string
  kind: PendingInviteEmailKind
  contextLabel: string
  inviteRawToken: string
  /** Matches DB `expires_at` for this pending invite. */
  expiresAtIso?: string
}): Promise<PendingInviteEmailResult> {
  const { to, kind, contextLabel, inviteRawToken, expiresAtIso } = params
  const base = appBaseUrl()
  const invitePath = `/invite/${inviteRawToken}`
  const inviteUrl = `${base}${invitePath}`
  const invitesUrl = `${base}/invites`

  const subject =
    kind === 'study'
      ? `Study invitation: ${contextLabel}`
      : `Institution invitation: ${contextLabel}`

  const expiryLine = expiresAtIso ? formatPendingInviteExpiryForEmail(expiresAtIso) : ''
  const expiryNote = expiryLine ? `\n\n${expiryLine}` : ''

  const text = `You have a pending ${kind} invitation on AuditWiz (${contextLabel}).

You already have an account. Sign in and open Invites in the app to review and accept:
${invitesUrl}

You can also open this link while signed in (use the invited email):
${inviteUrl}${expiryNote}`

  const apiKey = process.env.RESEND_API_KEY
  const from = process.env.RESEND_FROM_EMAIL || 'AuditWiz <onboarding@resend.dev>'

  if (!apiKey) {
    if (process.env.NODE_ENV === 'development') {
      console.info('[pending-invite-email] existing-user notify skipped — no RESEND_API_KEY', {
        to,
        subject,
      })
    }
    return {
      sent: false,
      reason: 'no_resend_api_key',
      noResendDetail: 'existing_user_notify_no_resend',
      studyInviteAudience: 'existing_auth_user',
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
    console.error('[pending-invite-email] Resend error (existing user notify)', res.status, body)
    return {
      sent: false,
      reason: 'resend_error',
      studyInviteAudience: 'existing_auth_user',
    }
  }

  return {
    sent: true,
    channel: 'resend',
    studyInviteAudience: 'existing_auth_user',
  }
}
