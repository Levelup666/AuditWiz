'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { ButtonLoadingLabel } from '@/components/ui/button-loading-label'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import Link from 'next/link'
import { toast } from '@/lib/toast'
import { upsertProfileNamesAfterSignup } from '@/app/auth/actions'
import { getPasswordStrengthLabel, validatePassword } from '@/lib/auth/password-policy'
import { OrcidOAuthButton } from '@/components/auth/orcid-oauth-button'

export default function SignUpForm({
  initialEmail = '',
  redirectedFrom,
}: {
  initialEmail?: string
  redirectedFrom?: string
}) {
  const router = useRouter()
  const [email, setEmail] = useState(initialEmail)
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [orcidContactEmail, setOrcidContactEmail] = useState(initialEmail)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (password !== confirmPassword) {
      toast.error('Validation error', 'Passwords do not match')
      return
    }

    const pwdCheck = validatePassword(password, { email })
    if (!pwdCheck.ok) {
      toast.error('Validation error', pwdCheck.errors[0] ?? 'Password does not meet requirements.')
      return
    }

    const fn = firstName.trim()
    const ln = lastName.trim()
    if (!fn || !ln) {
      toast.error('Validation error', 'First name and last name are required')
      return
    }

    setLoading(true)

    try {
      const supabase = createClient()
      const callbackNext = redirectedFrom
        ? `/auth/callback?next=${encodeURIComponent(redirectedFrom)}`
        : `/auth/callback?next=${encodeURIComponent('/onboarding')}`
      const emailRedirectTo = `${window.location.origin}${callbackNext.startsWith('/') ? callbackNext : `/${callbackNext}`}`
      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo,
          data: {
            first_name: fn,
            last_name: ln,
          },
        },
      })

      if (signUpError) {
        toast.error('Sign up failed', signUpError.message)
        setLoading(false)
        return
      }

      const hasSession = Boolean(signUpData?.session)
      if (hasSession) {
        const nameRes = await upsertProfileNamesAfterSignup(fn, ln)
        if (nameRes.error) {
          toast.error('Profile', nameRes.error)
          setLoading(false)
          return
        }
      }
      toast.success(
        'Account created',
        hasSession
          ? redirectedFrom
            ? 'Continue to complete your invitation.'
            : 'Continue to create your institution.'
          : 'Check your email to confirm your account.'
      )
      router.push(redirectedFrom || '/onboarding')
      router.refresh()
    } catch {
      toast.error('Sign up failed', 'An unexpected error occurred')
      setLoading(false)
    }
  }

  return (
    <>
      <form onSubmit={handleSubmit} className="mt-8 space-y-6">
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="firstName">First name</Label>
            <Input
              id="firstName"
              name="firstName"
              type="text"
              autoComplete="given-name"
              required
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="lastName">Last name</Label>
            <Input
              id="lastName"
              name="lastName"
              type="text"
              autoComplete="family-name"
              required
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              className="mt-1"
            />
          </div>
        </div>
        <div>
          <Label htmlFor="email">Email address</Label>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1"
          />
        </div>
        <div>
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1"
          />
          {password ? (
            <p className="mt-1 text-xs text-gray-500">
              Strength: {getPasswordStrengthLabel(password) ?? '—'} · At least 12 characters
            </p>
          ) : (
            <p className="mt-1 text-xs text-gray-500">
              At least 12 characters; avoid common passwords and your email address.
            </p>
          )}
        </div>
        <div>
          <Label htmlFor="confirmPassword">Confirm Password</Label>
          <Input
            id="confirmPassword"
            name="confirmPassword"
            type="password"
            autoComplete="new-password"
            required
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="mt-1"
          />
        </div>
      </div>

      <div>
        <Button type="submit" className="w-full" disabled={loading} aria-busy={loading}>
          <ButtonLoadingLabel loading={loading} loadingLabel="Creating account…">
            Sign up
          </ButtonLoadingLabel>
        </Button>
      </div>

      <div className="text-center text-sm">
        <span className="text-gray-600">Already have an account? </span>
        <Link href="/auth/signin" className="font-medium text-primary hover:underline">
          Sign in
        </Link>
      </div>
      </form>

      <div className="relative mt-8">
        <div className="absolute inset-0 flex items-center" aria-hidden="true">
          <div className="w-full border-t border-gray-200" />
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-gray-50 px-2 text-gray-500">Or</span>
        </div>
      </div>

      <div className="mt-6 space-y-4 rounded-lg border border-gray-200 bg-white p-4">
        <div>
          <Label htmlFor="orcidSignupEmail">Contact email (required for ORCID sign-up)</Label>
          <Input
            id="orcidSignupEmail"
            name="orcidSignupEmail"
            type="email"
            autoComplete="email"
            required
            value={orcidContactEmail}
            onChange={(e) => setOrcidContactEmail(e.target.value)}
            className="mt-1"
            placeholder="you@institution.edu"
          />
          <p className="mt-1 text-xs text-gray-500">
            Use the same email as on your ORCID record. You will confirm it again after ORCID
            sign-in if we cannot read it automatically.
          </p>
        </div>
        <OrcidOAuthButton
          mode="signup"
          nextPath={
            redirectedFrom
              ? `/account/setup?orcid_email_required=1&next=${encodeURIComponent(redirectedFrom)}`
              : undefined
          }
          className="w-full"
          label="Sign up with ORCID"
          pendingContactEmail={orcidContactEmail}
          disabled={!orcidContactEmail.trim()}
        />
        <p className="text-center text-xs text-gray-500">
          Creates your account after ORCID sign-in. Email is required for invites and
          notifications.
        </p>
      </div>
    </>
  )
}
