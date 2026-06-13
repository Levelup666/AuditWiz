'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from '@/lib/toast'
import { saveAccountSetup } from '@/app/account/setup/actions'
import { userHasUsableAuthEmail } from '@/lib/auth/orcid-email'
import { clearPendingOrcidContactEmail } from '@/lib/auth/pending-orcid-contact-email'
import { OrcidContactEmailField } from '@/components/account/orcid-contact-email-field'
import { Loader2 } from 'lucide-react'
import { FormStatusBanner, useFormStatus } from '@/components/account/form-status-banner'
import PasswordRotationPreference from '@/components/account/password-rotation-preference'
import {
  getPasswordStrengthLabel,
  validatePassword,
  type PasswordRotationDays,
} from '@/lib/auth/password-policy'

interface AccountSetupFormProps {
  nextPath: string
  inviteToken?: string
  /** From /account/setup?…&pending_invite=1 — require password before Invites. */
  pendingInviteFlow?: boolean
  /** From password gate — user must finish credentials before app access. */
  credentialsRequired?: boolean
  userEmail?: string
  orcidPrimary?: boolean
  orcidEmailLocked?: boolean
  /** Show required editable contact email (ORCID-primary without usable email). */
  needsOrcidEmail?: boolean
  showOrcidEmailInput?: boolean
  /** Emails read from ORCID (public/member); shown as hints when non-empty. */
  orcidDiscoverableEmails?: string[]
  /** Public API returned no emails — user must attest manual entry matches ORCID. */
  orcidEmailRequiresAttestation?: boolean
  /** Block notification toggles until contact email is on file. */
  notificationsDisabled?: boolean
  initialFirstName: string | null
  initialLastName: string | null
  initialNickname: string | null
  initialEmailInvites: boolean
  initialEmailStudy: boolean
  passwordPolicyLegacy?: boolean
  initialRotationDays?: number | null
}

export default function AccountSetupForm({
  nextPath,
  inviteToken,
  pendingInviteFlow = false,
  credentialsRequired = false,
  userEmail,
  orcidPrimary = false,
  orcidEmailLocked = false,
  needsOrcidEmail = false,
  showOrcidEmailInput = false,
  orcidDiscoverableEmails = [],
  orcidEmailRequiresAttestation = false,
  notificationsDisabled = false,
  initialFirstName,
  initialLastName,
  initialNickname,
  initialEmailInvites,
  initialEmailStudy,
  passwordPolicyLegacy = false,
  initialRotationDays = null,
}: AccountSetupFormProps) {
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [rotationDays, setRotationDays] = useState<PasswordRotationDays | ''>(() => {
    if (initialRotationDays === 30 || initialRotationDays === 60 || initialRotationDays === 90) {
      return initialRotationDays
    }
    return ''
  })
  const [pending, setPending] = useState(false)
  const { status, setStatus } = useFormStatus()

  const showPasswordPolicyExtras = !orcidPrimary && !passwordPolicyLegacy
  const requirePassword = Boolean(inviteToken || pendingInviteFlow) && !orcidPrimary
  const passwordStrength = getPasswordStrengthLabel(password)

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const form = e.currentTarget
    const pwd = password.trim()
    const confirm = confirmPassword.trim()
    const fdNames = new FormData(form)
    const fn = (fdNames.get('first_name') as string)?.trim() ?? ''
    const ln = (fdNames.get('last_name') as string)?.trim() ?? ''

    const orcidEmail = (fdNames.get('orcid_contact_email') as string)?.trim() ?? ''

    if (showOrcidEmailInput && !orcidEmail) {
      const message = 'Enter your contact email to continue.'
      setStatus({ kind: 'error', message })
      toast.error('Email required', message)
      return
    }

    if (showOrcidEmailInput && orcidEmailRequiresAttestation) {
      const attested = fdNames.get('orcid_email_attested') === 'on'
      if (!attested) {
        const message = 'Confirm that your entry matches the email on your ORCID account.'
        setStatus({ kind: 'error', message })
        toast.error('Confirmation required', message)
        return
      }
    }

    if (requirePassword && !pwd) {
      const message = 'Set a password to finish account setup before you continue.'
      setStatus({ kind: 'error', message })
      toast.error('Password', message)
      return
    }

    if ((inviteToken || pendingInviteFlow) && (!fn || !ln)) {
      const message = 'Enter your first and last name before you continue.'
      setStatus({ kind: 'error', message })
      toast.error('Name', message)
      return
    }

    if (pwd || confirm) {
      if (pwd !== confirm) {
        const message = 'Password change failed: passwords do not match.'
        setStatus({ kind: 'error', message })
        toast.error('Password', 'Passwords do not match.')
        return
      }
      const check = validatePassword(pwd, { email: userEmail })
      if (!check.ok) {
        const message = check.errors[0] ?? 'Password does not meet requirements.'
        setStatus({ kind: 'error', message: `Password change failed: ${message}` })
        toast.error('Password', message)
        return
      }
    }

    if (showPasswordPolicyExtras && !initialRotationDays) {
      if (!rotationDays) {
        const message = 'Choose how often you want to change your password (30, 60, or 90 days).'
        setStatus({ kind: 'error', message })
        toast.error('Password interval', message)
        return
      }
    }

    setPending(true)
    setStatus(null)
    try {
      const fd = new FormData(form)
      fd.set('next', nextPath)
      fd.set('password', pwd)
      fd.set('confirm_password', confirm)
      if (rotationDays) {
        fd.set('password_rotation_days', String(rotationDays))
      }
      const result = await saveAccountSetup(fd)
      if (result?.error) {
        const message = result.error
        setStatus({ kind: 'error', message })
        toast.error('Could not save preferences', message)
        setPending(false)
        return
      }
      setStatus({ kind: 'success', message: 'Account setup saved. Continuing…' })
      toast.success('Account setup saved', 'Continuing…')
      clearPendingOrcidContactEmail()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Try again.'
      setStatus({ kind: 'error', message: `Save failed: ${message}` })
      toast.error('Something went wrong', message)
      setPending(false)
    }
  }

  const hasUsableEmail = userHasUsableAuthEmail(userEmail)
  const showContactSection =
    showOrcidEmailInput ||
    (orcidEmailLocked && hasUsableEmail) ||
    ((inviteToken || pendingInviteFlow) && hasUsableEmail)

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      <FormStatusBanner status={status} />
      <input type="hidden" name="next" value={nextPath} />
      {inviteToken ? <input type="hidden" name="invite_token" value={inviteToken} /> : null}
      {pendingInviteFlow ? <input type="hidden" name="pending_invite_flow" value="on" /> : null}

      {showContactSection ? (
        <div className="space-y-4 rounded-lg border border-border bg-card p-6 shadow-sm">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Contact email</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {showOrcidEmailInput ? (
                <>
                  Required for study and institution invites and for email notifications. Use the
                  same email as on your ORCID account. It cannot be changed after you save.
                  {orcidEmailRequiresAttestation
                    ? ' We could not read your ORCID email automatically—enter it below and confirm.'
                    : orcidDiscoverableEmails.length > 0
                      ? ' Choose a suggested address or type the one on your ORCID record.'
                      : ' Enter the address listed on your ORCID record.'}
                </>
              ) : orcidEmailLocked ? (
                <>
                  This address comes from your ORCID account and is used for invites and
                  notifications. It cannot be changed in AuditWiz.
                </>
              ) : (
                <>This invitation is tied to your account email (read-only).</>
              )}
            </p>
          </div>
          {showOrcidEmailInput ? (
            <OrcidContactEmailField
              orcidDiscoverableEmails={orcidDiscoverableEmails}
              orcidEmailRequiresAttestation={orcidEmailRequiresAttestation}
              initialEmail={hasUsableEmail ? userEmail : ''}
            />
          ) : (
            <Input readOnly value={userEmail} className="max-w-md bg-muted" />
          )}
        </div>
      ) : null}

      <div className="space-y-4 rounded-lg border border-border bg-card p-6 shadow-sm">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Your name</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            In member lists and pickers, others see <strong>First L.</strong> (first letter of your
            last name). If you add a nickname below, <strong>that nickname is shown instead</strong>{' '}
            everywhere those lists appear.
          </p>
        </div>
        <div className="grid max-w-xl gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="first_name">First name *</Label>
            <Input
              id="first_name"
              name="first_name"
              type="text"
              autoComplete="given-name"
              required
              defaultValue={initialFirstName ?? ''}
              placeholder="Jane"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="last_name">Last name *</Label>
            <Input
              id="last_name"
              name="last_name"
              type="text"
              autoComplete="family-name"
              required
              defaultValue={initialLastName ?? ''}
              placeholder="Smith"
            />
          </div>
        </div>
        <div className="space-y-2 max-w-xl">
          <Label htmlFor="nickname">Nickname (optional)</Label>
          <Input
            id="nickname"
            name="nickname"
            type="text"
            autoComplete="nickname"
            defaultValue={initialNickname ?? ''}
            placeholder="How you want to appear to collaborators"
          />
          <p className="text-xs text-muted-foreground">
            If you save a nickname, it <strong>replaces</strong> the default &quot;First L.&quot; name in all
            member lists and member dropdowns in the app.
          </p>
        </div>
      </div>

      {!orcidPrimary ? (
        <div className="space-y-4 rounded-lg border border-border bg-card p-6 shadow-sm">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Password</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {inviteToken || pendingInviteFlow ? (
                <>
                  You need a password you will use to sign in before you can accept invitations in
                  the app.
                </>
              ) : credentialsRequired ? (
                <>
                  Confirm or set the password you will use to sign in, then choose your change
                  interval below.
                </>
              ) : (
                <>
                  If you want to change your password, enter a new one here. Leave both fields blank
                  to keep your current password.
                </>
              )}
            </p>
          </div>
          <div className="grid max-w-md gap-4 sm:grid-cols-1">
            <div className="space-y-2">
              <Label htmlFor="password">New password</Label>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 12 characters"
              />
              {password ? (
                <p className="text-xs text-muted-foreground">
                  Strength: {passwordStrength ?? '—'}
                  {showPasswordPolicyExtras
                    ? ' · Use 12+ characters and avoid common words or your email.'
                    : null}
                </p>
              ) : showPasswordPolicyExtras ? (
                <p className="text-xs text-muted-foreground">
                  At least 12 characters; avoid common passwords and your email address.
                </p>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm_password">Confirm password</Label>
              <Input
                id="confirm_password"
                name="confirm_password"
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
              />
            </div>
          </div>
        </div>
      ) : null}

      {showPasswordPolicyExtras && !initialRotationDays ? (
        <div className="space-y-4 rounded-lg border border-border bg-card p-6 shadow-sm">
          <PasswordRotationPreference
            value={rotationDays}
            onChange={setRotationDays}
            required
            disabled={pending}
          />
        </div>
      ) : null}

      <div className="space-y-4 rounded-lg border border-border bg-card p-6 shadow-sm">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Notifications</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Control optional email from this app. Critical security messages may still be sent by
            your sign-in provider.
          </p>
        </div>
        <div className="space-y-3">
          {notificationsDisabled || showOrcidEmailInput ? (
            <p className="text-sm text-muted-foreground">
              {showOrcidEmailInput
                ? 'Save your contact email above before enabling email notifications.'
                : 'Save your ORCID contact email above before enabling email notifications.'}
            </p>
          ) : null}
          <label
            className={`flex items-start gap-3 rounded-md border border-transparent p-2 ${
              notificationsDisabled || showOrcidEmailInput
                ? 'cursor-not-allowed opacity-50'
                : 'cursor-pointer hover:bg-muted/40'
            }`}
          >
            <input
              type="checkbox"
              name="notification_email_invites"
              defaultChecked={initialEmailInvites}
              disabled={notificationsDisabled || showOrcidEmailInput}
              className="mt-1 h-4 w-4 rounded border-input"
            />
            <span>
              <span className="font-medium text-foreground">Invites &amp; membership</span>
              <span className="block text-sm text-muted-foreground">
                Emails when you are invited to an institution or study (when outbound mail is
                configured).
              </span>
            </span>
          </label>
          <label
            className={`flex items-start gap-3 rounded-md border border-transparent p-2 ${
              notificationsDisabled || showOrcidEmailInput
                ? 'cursor-not-allowed opacity-50'
                : 'cursor-pointer hover:bg-muted/40'
            }`}
          >
            <input
              type="checkbox"
              name="notification_email_study_activity"
              defaultChecked={initialEmailStudy}
              disabled={notificationsDisabled || showOrcidEmailInput}
              className="mt-1 h-4 w-4 rounded border-input"
            />
            <span>
              <span className="font-medium text-foreground">Study activity</span>
              <span className="block text-sm text-muted-foreground">
                Emails about study updates when we add that channel.
              </span>
            </span>
          </label>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Saving…
            </>
          ) : (
            'Save and continue'
          )}
        </Button>
        <p className="text-sm text-muted-foreground">
          You can change your name and nickname later from your profile and account settings.
        </p>
      </div>
    </form>
  )
}
