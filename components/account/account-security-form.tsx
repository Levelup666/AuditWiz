'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { ButtonLoadingLabel } from '@/components/ui/button-loading-label'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { toast } from '@/lib/toast'
import PasswordRotationPreference from '@/components/account/password-rotation-preference'
import {
  getPasswordStrengthLabel,
  type PasswordRotationDays,
} from '@/lib/auth/password-policy'
import {
  updateAccountPassword,
  updatePasswordRotationPreference,
} from '@/app/account/security/actions'

type AccountSecurityFormProps = {
  userEmail: string
  passwordPolicyLegacy: boolean
  subjectToPolicy: boolean
  initialRotationDays: number | null
  passwordExpired: boolean
  rotationRequired: boolean
}

export default function AccountSecurityForm({
  userEmail,
  passwordPolicyLegacy,
  subjectToPolicy,
  initialRotationDays,
  passwordExpired,
  rotationRequired,
}: AccountSecurityFormProps) {
  const router = useRouter()
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [rotationDays, setRotationDays] = useState<PasswordRotationDays | ''>(() => {
    if (initialRotationDays === 30 || initialRotationDays === 60 || initialRotationDays === 90) {
      return initialRotationDays
    }
    return ''
  })
  const [passwordPending, setPasswordPending] = useState(false)
  const [rotationPending, setRotationPending] = useState(false)

  const strength = getPasswordStrengthLabel(newPassword)

  async function handlePasswordSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setPasswordPending(true)
    try {
      const fd = new FormData(e.currentTarget)
      const result = await updateAccountPassword(fd)
      if (result?.error) {
        toast.error('Password update failed', result.error)
        return
      }
      toast.success('Password updated')
      setNewPassword('')
      setConfirmPassword('')
      router.refresh()
    } catch {
      toast.error('Something went wrong', 'Try again.')
    } finally {
      setPasswordPending(false)
    }
  }

  async function handleRotationSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setRotationPending(true)
    try {
      const fd = new FormData(e.currentTarget)
      fd.set('password_rotation_days', rotationDays ? String(rotationDays) : '')
      const result = await updatePasswordRotationPreference(fd)
      if (result?.error) {
        toast.error('Could not save preference', result.error)
        return
      }
      toast.success('Password change interval saved')
      router.refresh()
    } catch {
      toast.error('Something went wrong', 'Try again.')
    } finally {
      setRotationPending(false)
    }
  }

  return (
    <div className="space-y-6">
      {(passwordExpired || rotationRequired) && subjectToPolicy ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50/80 p-4 text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
          {passwordExpired
            ? 'Your password has expired based on your chosen interval. Set a new password to continue using the app.'
            : 'Choose how often you want to change your password before continuing.'}
        </div>
      ) : null}

      {passwordPolicyLegacy ? (
        <Card>
          <CardHeader>
            <CardTitle>Password policy</CardTitle>
            <CardDescription>
              Your account uses the previous password rules. You are not required to change your
              password on a schedule. If you set a new password voluntarily, it must meet the
              current strength requirements.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Change password</CardTitle>
          <CardDescription>
            Use at least 12 characters. Avoid common words and your email address (
            {userEmail || 'your account email'}).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handlePasswordSubmit} className="space-y-4 max-w-md">
            <div className="space-y-2">
              <Label htmlFor="new_password">New password</Label>
              <Input
                id="new_password"
                name="new_password"
                type="password"
                autoComplete="new-password"
                required
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
              {newPassword ? (
                <p className="text-xs text-muted-foreground">Strength: {strength ?? '—'}</p>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm_password">Confirm new password</Label>
              <Input
                id="confirm_password"
                name="confirm_password"
                type="password"
                autoComplete="new-password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            </div>
            <Button type="submit" disabled={passwordPending} aria-busy={passwordPending}>
              <ButtonLoadingLabel loading={passwordPending} loadingLabel="Updating…">
                Update password
              </ButtonLoadingLabel>
            </Button>
          </form>
        </CardContent>
      </Card>

      {subjectToPolicy ? (
        <Card>
          <CardHeader>
            <CardTitle>Password change interval</CardTitle>
            <CardDescription>
              How often you will be asked to set a new password. You can change this anytime.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleRotationSubmit} className="space-y-4">
              <PasswordRotationPreference
                value={rotationDays}
                onChange={setRotationDays}
                required={rotationRequired || !initialRotationDays}
                disabled={rotationPending}
              />
              <Button type="submit" disabled={rotationPending || !rotationDays} aria-busy={rotationPending}>
                <ButtonLoadingLabel loading={rotationPending} loadingLabel="Saving…">
                  Save interval
                </ButtonLoadingLabel>
              </Button>
            </form>
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}
