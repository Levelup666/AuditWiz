'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from '@/lib/toast'
import { saveAccountSetup } from '@/app/account/setup/actions'
import { Loader2 } from 'lucide-react'

interface AccountSetupFormProps {
  nextPath: string
  inviteToken?: string
  userEmail?: string
  initialFirstName: string | null
  initialLastName: string | null
  initialNickname: string | null
  initialEmailInvites: boolean
  initialEmailStudy: boolean
}

export default function AccountSetupForm({
  nextPath,
  inviteToken,
  userEmail,
  initialFirstName,
  initialLastName,
  initialNickname,
  initialEmailInvites,
  initialEmailStudy,
}: AccountSetupFormProps) {
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [pending, setPending] = useState(false)

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const form = e.currentTarget
    const pwd = password.trim()
    const confirm = confirmPassword.trim()
    const fdNames = new FormData(form)
    const fn = (fdNames.get('first_name') as string)?.trim() ?? ''
    const ln = (fdNames.get('last_name') as string)?.trim() ?? ''

    if (inviteToken && !pwd) {
      toast.error('Password', 'Set a password to finish accepting your invitation.')
      return
    }

    if (inviteToken && (!fn || !ln)) {
      toast.error('Name', 'Enter your first and last name before accepting your invitation.')
      return
    }

    if (pwd || confirm) {
      if (pwd.length < 8) {
        toast.error('Password', 'Use at least 8 characters.')
        return
      }
      if (pwd !== confirm) {
        toast.error('Password', 'Passwords do not match.')
        return
      }
    }

    setPending(true)
    try {
      const fd = new FormData(form)
      fd.set('next', nextPath)
      fd.set('password', pwd)
      fd.set('confirm_password', confirm)
      const result = await saveAccountSetup(fd)
      if (result?.error) {
        toast.error('Could not save preferences', result.error)
        setPending(false)
        return
      }
    } catch (err) {
      toast.error('Something went wrong', err instanceof Error ? err.message : 'Try again.')
      setPending(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      <input type="hidden" name="next" value={nextPath} />
      {inviteToken ? <input type="hidden" name="invite_token" value={inviteToken} /> : null}

      {inviteToken && userEmail ? (
        <div className="space-y-4 rounded-lg border border-border bg-card p-6 shadow-sm">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Email</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              This invitation is tied to your account email (read-only).
            </p>
          </div>
          <Input readOnly value={userEmail} className="max-w-md bg-muted" />
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

      <div className="space-y-4 rounded-lg border border-border bg-card p-6 shadow-sm">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Password</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            If you arrived from an invitation link, set a password you will use to sign in. Leave
            blank to keep your current password.
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
              placeholder="••••••••"
            />
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

      <div className="space-y-4 rounded-lg border border-border bg-card p-6 shadow-sm">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Notifications</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Control optional email from this app. Critical security messages may still be sent by
            your sign-in provider.
          </p>
        </div>
        <div className="space-y-3">
          <label className="flex cursor-pointer items-start gap-3 rounded-md border border-transparent p-2 hover:bg-muted/40">
            <input
              type="checkbox"
              name="notification_email_invites"
              defaultChecked={initialEmailInvites}
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
          <label className="flex cursor-pointer items-start gap-3 rounded-md border border-transparent p-2 hover:bg-muted/40">
            <input
              type="checkbox"
              name="notification_email_study_activity"
              defaultChecked={initialEmailStudy}
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
