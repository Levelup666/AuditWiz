'use client'

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { Session } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'
import { safeAppPath } from '@/lib/invites/safe-redirect'
import {
  consumeEarlyHashCapture,
  readEarlyHashCapture,
} from '@/lib/auth/early-hash-capture'

/**
 * Supabase invite / magic links often return tokens in the URL **hash** (#access_token=…&type=invite).
 * The server never sees the hash, so the session appears only after the client parses it.
 * The client may clear the hash after parsing — capture type / flags once before paint.
 */
export function AuthHashRedirect({
  redirectedFrom,
  children,
}: {
  redirectedFrom?: string
  children: React.ReactNode
}) {
  const router = useRouter()
  const [show, setShow] = useState(false)
  const done = useRef(false)
  const captureRef = useRef<{
    type: string | null
    hasImplicit: boolean
    waitForAuth: boolean
    captureSource: 'hash' | 'storage' | 'none'
  }>({
    type: null,
    hasImplicit: false,
    waitForAuth: false,
    captureSource: 'none',
  })

  useLayoutEffect(() => {
    const raw =
      typeof window !== 'undefined' && window.location.hash.startsWith('#')
        ? window.location.hash.slice(1)
        : ''
    const fromStorage = readEarlyHashCapture()

    let type: string | null = null
    let hasImplicit = false
    let captureSource: 'hash' | 'storage' | 'none' = 'none'

    if (raw) {
      type = new URLSearchParams(raw).get('type')
      hasImplicit = raw.includes('access_token=')
      captureSource = 'hash'
    } else if (fromStorage) {
      type = fromStorage.type
      hasImplicit = fromStorage.hasImplicit
      captureSource = 'storage'
    }

    const waitForAuth = type === 'invite' || hasImplicit
    captureRef.current = { type, hasImplicit, waitForAuth, captureSource }
    if (!waitForAuth) setShow(true)
  }, [])

  useEffect(() => {
    const supabase = createClient()

    function tryRedirect(
      session: Session | null,
      source: 'INITIAL_SESSION' | 'SIGNED_IN' | 'GET_SESSION'
    ) {
      if (done.current || !session) return

      const { waitForAuth, type: capType, hasImplicit: capImplicit } = captureRef.current

      // Password / credentials sign-in: SignInForm performs navigation (avoid racing router.replace).
      if (source === 'SIGNED_IN' && !waitForAuth) {
        return
      }

      const t = capType || ''

      done.current = true
      consumeEarlyHashCapture()

      if (t === 'invite') {
        const next = safeAppPath(redirectedFrom, '/invites')
        router.replace(`/account/setup?next=${encodeURIComponent(next)}`)
        return
      }

      if (capImplicit) {
        router.replace(safeAppPath(redirectedFrom, '/dashboard'))
        return
      }

      router.replace(safeAppPath(redirectedFrom, '/dashboard'))
    }

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN') {
        tryRedirect(session, event)
        if (event === 'INITIAL_SESSION' && !session) {
          const { waitForAuth } = captureRef.current
          if (!waitForAuth) setShow(true)
        }
      }
    })

    supabase.auth.getSession().then(({ data: { session } }) => {
      tryRedirect(session, 'GET_SESSION')
      const { waitForAuth } = captureRef.current
      if (!session && !waitForAuth) setShow(true)
    })

    const { waitForAuth } = captureRef.current
    if (waitForAuth) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          void supabase.auth.getSession().then(({ data: { session: s2 } }) => {
            if (!done.current && !s2) {
              consumeEarlyHashCapture()
              setShow(true)
            }
          })
        })
      })
    }

    return () => subscription.unsubscribe()
  }, [router, redirectedFrom])

  if (!show) {
    return (
      <p className="text-center text-sm text-muted-foreground">Completing sign-in…</p>
    )
  }

  return <>{children}</>
}
