'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { toast } from '@/lib/toast'
import { safeAppPath } from '@/lib/invites/safe-redirect'
import { getOrcidOAuthProviderId, getOrcidOAuthScopes } from '@/lib/auth/orcid-provider'
import { writePendingOrcidContactEmail } from '@/lib/auth/pending-orcid-contact-email'

type OrcidOAuthMode = 'signin' | 'signup' | 'link'

const defaultNext: Record<OrcidOAuthMode, string> = {
  signin: '/dashboard',
  signup: '/account/setup?orcid_email_required=1&next=/onboarding',
  link: '/profile',
}

export function OrcidOAuthButton({
  mode,
  nextPath,
  className,
  label,
  /** Required before redirect (sign-up with ORCID): stored for account setup. */
  pendingContactEmail,
  disabled,
}: {
  mode: OrcidOAuthMode
  nextPath?: string
  className?: string
  label?: string
  pendingContactEmail?: string
  disabled?: boolean
}) {
  const [loading, setLoading] = useState(false)

  const handleClick = async () => {
    if (disabled) return
    const pending = pendingContactEmail?.trim() ?? ''
    if (mode === 'signup' && !pending) {
      toast.error('Email required', 'Enter your contact email before signing up with ORCID.')
      return
    }
    if (pending) {
      writePendingOrcidContactEmail(pending)
    }

    setLoading(true)
    try {
      const supabase = createClient()
      const fallback = defaultNext[mode]
      const safeNext = safeAppPath(nextPath, fallback)
      const callbackUrl = `${window.location.origin}/auth/callback?next=${encodeURIComponent(safeNext)}`
      // Custom OIDC provider id from env (e.g. custom:orcid); see Supabase Auth → Providers.
      const provider = getOrcidOAuthProviderId()

      if (mode === 'link') {
        const { error } = await supabase.auth.linkIdentity({
          // eslint-disable-next-line @typescript-eslint/no-explicit-any -- custom:… providers are not in the built-in Provider union
          provider: provider as any,
          options: { redirectTo: callbackUrl, scopes: getOrcidOAuthScopes() },
        })
        if (error) throw error
      } else {
        const { error } = await supabase.auth.signInWithOAuth({
          provider: provider as any,
          options: { redirectTo: callbackUrl, scopes: getOrcidOAuthScopes() },
        })
        if (error) throw error
      }
    } catch (e) {
      toast.error('ORCID', e instanceof Error ? e.message : 'Sign-in could not start')
      setLoading(false)
    }
  }

  return (
    <Button
      type="button"
      variant="outline"
      className={className}
      disabled={loading || disabled}
      onClick={() => void handleClick()}
    >
      {loading ? 'Redirecting…' : label ?? 'Continue with ORCID'}
    </Button>
  )
}
