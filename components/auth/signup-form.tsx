'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import Link from 'next/link'
import { toast } from '@/lib/toast'

export default function SignUpForm({
  initialEmail = '',
  redirectedFrom,
}: {
  initialEmail?: string
  redirectedFrom?: string
}) {
  const router = useRouter()
  const [email, setEmail] = useState(initialEmail)
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (password !== confirmPassword) {
      toast.error('Validation error', 'Passwords do not match')
      return
    }

    if (password.length < 6) {
      toast.error('Validation error', 'Password must be at least 6 characters')
      return
    }

    setLoading(true)

    try {
      const supabase = createClient()
      const callbackNext = redirectedFrom
        ? `/auth/callback?next=${encodeURIComponent(redirectedFrom)}`
        : '/auth/callback'
      const { error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}${callbackNext.startsWith('/') ? callbackNext : `/${callbackNext}`}`,
        },
      })

      if (signUpError) {
        toast.error('Sign up failed', signUpError.message)
        setLoading(false)
        return
      }

      toast.success('Account created', 'Check your email to confirm your account')
      router.push(redirectedFrom || '/studies')
      router.refresh()
    } catch (err) {
      toast.error('Sign up failed', 'An unexpected error occurred')
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-8 space-y-6">
      <div className="space-y-4">
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
          <p className="mt-1 text-xs text-gray-500">Must be at least 6 characters</p>
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
        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? 'Creating account...' : 'Sign up'}
        </Button>
      </div>

      <div className="text-center text-sm">
        <span className="text-gray-600">Already have an account? </span>
        <Link href="/auth/signin" className="font-medium text-primary hover:underline">
          Sign in
        </Link>
      </div>
    </form>
  )
}
