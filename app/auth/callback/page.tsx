'use client'

import { Suspense, useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { createImplicitHashCallbackClient } from '@/lib/supabase/implicit-callback-client'
import { safeAppPath } from '@/lib/invites/safe-redirect'

const inviteLinkNotice =
  'This sign-in link may have expired or was already used. Try signing in, or request a new invite.'

function hashLooksImplicit(): boolean {
  if (typeof window === 'undefined') return false
  const h = window.location.hash
  return h.length > 1 && h.includes('access_token=')
}

/**
 * PKCE: ?code= on server-visible query (use cookie-based SSR client).
 * Implicit: #access_token=… in hash — must use a flowType: 'implicit' client, then setSession
 * on the app client so cookies match the rest of the app.
 */
function AuthCallbackContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const nextRaw = searchParams.get('next')
  const code = searchParams.get('code')
  const [hint, setHint] = useState('Completing sign-in…')
  const doneRef = useRef(false)

  useEffect(() => {
    const next = safeAppPath(nextRaw, '/onboarding')

    function go(path: string) {
      if (doneRef.current) return
      doneRef.current = true
      router.replace(path)
    }

    async function run() {
      try {
        if (code) {
          const appClient = createClient()
          const { error } = await appClient.auth.exchangeCodeForSession(code)
          if (error) {
            setHint('Sign-in could not be verified.')
            go(`/auth/signin?inviteNotice=${encodeURIComponent(inviteLinkNotice)}`)
            return
          }
          await fetch('/api/auth/sync-profile-metadata', { method: 'POST', credentials: 'same-origin' })
          go(next)
          return
        }

        if (!hashLooksImplicit()) {
          const appClient = createClient()
          const {
            data: { session: existing },
          } = await appClient.auth.getSession()
          if (existing) {
            go(next)
            return
          }
          setHint('Invalid or missing sign-in link.')
          go(`/auth/signin?inviteNotice=${encodeURIComponent(inviteLinkNotice)}`)
          return
        }

        const implicitClient = createImplicitHashCallbackClient()
        const {
          data: { session: parsed },
          error: parseErr,
        } = await implicitClient.auth.getSession()

        if (parseErr || !parsed) {
          setHint('Sign-in could not be verified.')
          go(`/auth/signin?inviteNotice=${encodeURIComponent(inviteLinkNotice)}`)
          return
        }

        // After implicit parse, hash is cleared — first createClient() must not see #access_token or PKCE init throws.
        const appClient = createClient()
        const { error: setErr } = await appClient.auth.setSession({
          access_token: parsed.access_token,
          refresh_token: parsed.refresh_token,
        })

        if (setErr) {
          setHint('Sign-in could not be verified.')
          go(`/auth/signin?inviteNotice=${encodeURIComponent(inviteLinkNotice)}`)
          return
        }

        await fetch('/api/auth/sync-profile-metadata', { method: 'POST', credentials: 'same-origin' })
        go(next)
      } catch {
        go('/auth/auth-code-error')
      }
    }

    void run()
  }, [router, nextRaw, code])

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <p className="text-center text-sm text-muted-foreground">{hint}</p>
    </div>
  )
}

export default function AuthCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
          <p className="text-center text-sm text-muted-foreground">Loading…</p>
        </div>
      }
    >
      <AuthCallbackContent />
    </Suspense>
  )
}
