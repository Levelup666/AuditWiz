/**
 * Notify users about pending invites (study or institution).
 * 1) When supabaseAdmin is provided, tries auth.admin.inviteUserByEmail (same mailer as sign-up).
 * 2) Otherwise or if that user already exists, uses Postmark when POSTMARK_SERVER_TOKEN is set.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { formatPendingInviteExpiryForEmail } from '@/lib/invites/pending-invite-expiry'
import { getJwtRoleFromSecret } from '@/lib/supabase/jwt-role-from-secret'
import { sendTransactionalEmail } from '@/lib/email/send-transactional'

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
    return 'No email was sent: Supabase Auth is rate-limiting outbound email for this project (common after many invites or tests in a short window). Wait and retry, or configure custom SMTP in the Dashboard. Set POSTMARK_SERVER_TOKEN to deliver via Postmark instead. The invite is saved—share the link from your records if needed.'
  }
  if (supabaseAuthError?.code === 'not_admin') {
    return 'No email was sent: this is not your institution or study role. Supabase Auth rejected the server invite call (Auth code not_admin). Usually SUPABASE_SERVICE_ROLE_KEY is set to the anon publishable key by mistake—use the service_role secret from Supabase Dashboard → Project Settings → API. Or set POSTMARK_SERVER_TOKEN so this app sends the same invite link via Postmark. The invite is saved—share the link from your records if needed.'
  }
  const smtpHint =
    'If you use custom SMTP: open Supabase Dashboard → Project Settings → Auth → SMTP Settings, send a test email, and confirm the sender address/domain matches what your provider allows (SPF/DKIM), TLS mode matches the port (often 587 STARTTLS or 465 SSL), and credentials are correct.'
  return `No email was sent: Supabase Auth could not deliver the invite email (${smtpHint}). Also confirm Authentication → URL Configuration allows your app redirect URLs (e.g. …/auth/callback). Set POSTMARK_SERVER_TOKEN in this app to fall back to Postmark with the same invite link text. The invite is saved—share the link from your records if needed.`
}

export type PendingInviteEmailResult = {
  sent: boolean
  /** How the message was delivered when sent is true */
  channel?: 'supabase' | 'postmark'
  reason?: 'no_postmark_token' | 'no_from_address' | 'postmark_error'
  /**
   * When sent is false, why we fell through to needing Postmark transactional mail.
   */
  transactionalFallbackDetail?:
    | 'supabase_said_user_exists'
    | 'supabase_invite_failed'
    | 'supabase_admin_not_provided'
    | 'supabase_service_role_misconfigured'
    | 'existing_user_notify_no_postmark'
  /** Last Auth admin error when inviteUserByEmail did not succeed (safe to surface; no PII). */
  supabaseAuthError?: { code?: string; status?: number; message?: string }
  /** Study email invites: refines admin toast copy (institution invites omit this). */
  studyInviteAudience?: 'new_email' | 'existing_auth_user'
}

/** Shared API/UI fields after sendPendingInviteEmail (institution + study invite routes). */
export function inviteEmailDispatchFields(emailResult: PendingInviteEmailResult): {
  email_dispatched: boolean
  email_channel: 'supabase' | 'postmark' | null
  email_dispatch_message: string | undefined
  email_dispatch_detail: string | null
  email_supabase_error: { code?: string; status?: number; message?: string } | null
} {
  const audience = emailResult.studyInviteAudience
  const detail = emailResult.transactionalFallbackDetail

  const emailDispatchMessage = emailResult.sent
    ? audience === 'existing_auth_user'
      ? 'Pending invite created. We emailed them to sign in and open Invites to accept (direct link included in the message).'
      : emailResult.channel === 'supabase'
        ? 'An invite link was sent via Supabase Auth. They will land on account setup first, then can open Invites to accept.'
        : audience === 'new_email'
          ? 'Pending invite created. We emailed them an invitation link to sign up or sign in and complete setup.'
          : undefined
    : emailResult.reason === 'no_postmark_token'
      ? detail === 'existing_user_notify_no_postmark'
        ? 'No email was sent: existing users are notified via Postmark for this flow. Set POSTMARK_SERVER_TOKEN. The pending invite is saved—they can still accept from Invites when signed in.'
        : detail === 'supabase_said_user_exists'
          ? 'No email was sent: this address already has an Auth user. Set POSTMARK_SERVER_TOKEN to deliver a copy, or ask them to sign in and open Invites. The invite is saved.'
          : detail === 'supabase_service_role_misconfigured'
            ? 'No email was sent: the server’s SUPABASE_SERVICE_ROLE_KEY is not the service_role JWT (often the anon key was pasted by mistake). Fix it in Dashboard → Project Settings → API, or set POSTMARK_SERVER_TOKEN to email the invite link. The invite is saved.'
            : detail === 'supabase_invite_failed'
              ? supabaseInviteFailedUserMessage(emailResult.supabaseAuthError)
              : 'No email was sent: Postmark is not configured (set POSTMARK_SERVER_TOKEN). The invite is saved.'
      : emailResult.reason === 'no_from_address'
        ? 'No email was sent: POSTMARK_FROM_EMAIL is not set. Configure a verified sender in Postmark and set POSTMARK_FROM_EMAIL. The invite is saved.'
        : 'The invite is saved, but Postmark rejected the message. Check server logs and POSTMARK_FROM_EMAIL / sender verification.'

  return {
    email_dispatched: emailResult.sent,
    email_channel: emailResult.channel ?? null,
    email_dispatch_message: emailDispatchMessage,
    email_dispatch_detail: detail ?? null,
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

function mapTransactionalFailure(
  result: { sent: boolean; reason?: string },
  fallback: Omit<PendingInviteEmailResult, 'sent' | 'channel' | 'reason'>
): PendingInviteEmailResult {
  if (result.sent) {
    return { ...fallback, sent: true, channel: 'postmark' }
  }
  const reason =
    result.reason === 'no_from_address'
      ? ('no_from_address' as const)
      : result.reason === 'postmark_error'
        ? ('postmark_error' as const)
        : ('no_postmark_token' as const)
  return { ...fallback, sent: false, reason }
}

export async function sendPendingInviteEmail(params: {
  to: string
  kind: PendingInviteEmailKind
  contextLabel: string
  /** Opaque invite token (raw). Email and redirects use /invite/[token]. */
  inviteRawToken?: string
  /** Matches DB `expires_at` — included in plain-text body for Supabase + Postmark. */
  expiresAtIso?: string
  /** Service-role client: enables Supabase invite email (same provider as sign-up confirmation). */
  supabaseAdmin?: SupabaseClient
}): Promise<PendingInviteEmailResult> {
  const { to, kind, contextLabel, supabaseAdmin, inviteRawToken, expiresAtIso } = params
  const base = appBaseUrl()
  const invitePath = inviteRawToken ? `/invite/${inviteRawToken}` : null
  const inviteUrl = invitePath ? `${base}${invitePath}` : `${base}/invites`
  /** New invitees must finish credentials before accepting; magic link lands here first. */
  const setupFirstPath = '/account/setup?next=/invites&pending_invite=1'
  const callbackNext = `/auth/callback?next=${encodeURIComponent(setupFirstPath)}`
  const redirectTo = `${base}${callbackNext.startsWith('/') ? callbackNext : '/' + callbackNext}`

  const setupUrl = `${base}${setupFirstPath}`

  const invitesUrl = `${base}/invites`
  const subject =
    kind === 'study'
      ? `Pending study invite: ${contextLabel}`
      : `Pending institution invite: ${contextLabel}`

  const expiryLine = expiresAtIso ? formatPendingInviteExpiryForEmail(expiresAtIso) : ''
  const expiryNote = expiryLine ? `\n\n${expiryLine}` : ''

  const text = invitePath
    ? `You have a pending ${kind} invitation on AuditWiz (${contextLabel}).

Step 1 — Sign in or create your account, then complete account setup (password, legal name, preferences). Use this link right after you open the sign-in link from your email:
${setupUrl}

Step 2 — When setup is finished, open Invites in the app and accept your invitation there:
${invitesUrl}

Optional — You can also open this invite summary link while signed in (you will be sent to account setup first if you still need credentials):
${inviteUrl}${expiryNote}`
    : `You have a pending ${kind} invitation on AuditWiz (${contextLabel}).

After signing in, finish account setup (password and notification preferences), then open Invites:
${setupUrl}

If you already completed setup, go directly to Invites:
${invitesUrl}${expiryNote}`

  let transactionalFallbackDetail: NonNullable<
    PendingInviteEmailResult['transactionalFallbackDetail']
  > = 'supabase_admin_not_provided'
  let supabaseAuthError: PendingInviteEmailResult['supabaseAuthError']
  function authErr(e: { code?: string; status?: number; message?: string }) {
    const rawMsg = typeof e.message === 'string' ? e.message : undefined
    return {
      code: typeof e.code === 'string' ? e.code : undefined,
      status: typeof e.status === 'number' ? e.status : undefined,
      message: rawMsg ? truncateAuthMessage(rawMsg) : undefined,
    }
  }

  const jwtRole = getJwtRoleFromSecret(process.env.SUPABASE_SERVICE_ROLE_KEY)

  if (supabaseAdmin) {
    if (jwtRole && jwtRole !== 'service_role') {
      transactionalFallbackDetail = 'supabase_service_role_misconfigured'
      supabaseAuthError = {
        code: 'misconfigured_service_role_key',
        message:
          'SUPABASE_SERVICE_ROLE_KEY must be the service_role secret from Supabase Dashboard (API settings), not the anon publishable key.',
      }
    } else {
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
        transactionalFallbackDetail = 'supabase_said_user_exists'
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
        supabaseAuthError = authErr(
          secondErr as { code?: string; status?: number; message?: string }
        )
        if (isSupabaseAlreadyRegisteredError(secondErr)) {
          transactionalFallbackDetail = 'supabase_said_user_exists'
        } else {
          transactionalFallbackDetail = 'supabase_invite_failed'
          console.warn(
            '[pending-invite-email] inviteUserByEmail failed after retry; trying Postmark if configured:',
            (secondErr as { message?: string }).message,
            (secondErr as { code?: string }).code
          )
        }
      } else {
        transactionalFallbackDetail = 'supabase_invite_failed'
        console.warn(
          '[pending-invite-email] inviteUserByEmail failed; trying Postmark if configured:',
          (firstErr as { message?: string }).message,
          (firstErr as { code?: string }).code
        )
      }
    }
  }

  const postmarkResult = await sendTransactionalEmail({ to, subject, text })
  return mapTransactionalFailure(postmarkResult, {
    transactionalFallbackDetail,
    supabaseAuthError,
    ...(kind === 'study' ? { studyInviteAudience: 'new_email' as const } : {}),
  })
}

/**
 * Email for an Auth user who already exists: no inviteUserByEmail (avoids "create account" UX).
 * Postmark transactional: sign in → Invites, plus optional /invite/{token} deep link.
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

  const postmarkResult = await sendTransactionalEmail({ to, subject, text })
  return mapTransactionalFailure(postmarkResult, {
    transactionalFallbackDetail: 'existing_user_notify_no_postmark',
    studyInviteAudience: 'existing_auth_user',
  })
}

/** User-facing message when a pending ORCID-only invite has no email to send. */
export function orcidOnlyInviteDispatchMessage(orcidId: string, inviteUrl?: string): string {
  const linkNote = inviteUrl
    ? ` Share this link: ${inviteUrl}`
    : ' Share the invite link from your records.'
  return `Pending invite created for ORCID ${orcidId}. No email was sent (no address on file). Ask them to sign in with ORCID, complete contact email setup if prompted, then open Invites to accept.${linkNote}`
}
