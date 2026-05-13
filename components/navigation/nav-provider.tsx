'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export type OrcidSessionIdentity = {
  orcidId: string
  verified: boolean
  /** True when the current Supabase Auth session was established via the ORCID OIDC provider. */
  signedInViaOrcid: boolean
}

type NavContextType = {
  isOpen: boolean
  setIsOpen: React.Dispatch<React.SetStateAction<boolean>>
  /** True when user has an active session; sidebar and shell margin apply only then */
  isAuthenticated: boolean
  /** Null while loading; whether the Logs hub is available (auditor/admin on ≥1 study). */
  canViewLogs: boolean | null
  /** Null while loading; whether the user has at least one active audit engagement. */
  hasActiveAuditorEngagement: boolean | null
  /** Null while loading; verified ORCID linked to the current account (if any). */
  orcidIdentity: OrcidSessionIdentity | null
}
const NavContext = createContext<NavContextType | null>(null)

export function useNavContext() {
  const ctx = useContext(NavContext)
  return ctx
}

export default function NavProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const [isOpen, setIsOpen] = useState(false)
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [canViewLogs, setCanViewLogs] = useState<boolean | null>(null)
  const [hasActiveAuditorEngagement, setHasActiveAuditorEngagement] = useState<
    boolean | null
  >(null)
  const [signedInViaOrcid, setSignedInViaOrcid] = useState<boolean>(false)
  const [orcidIdentity, setOrcidIdentity] = useState<OrcidSessionIdentity | null>(null)

  useEffect(() => {
    if (pathname?.startsWith('/auth/callback')) {
      return
    }

    const supabase = createClient()
    supabase.auth.getSession().then(({ data: { session } }) => {
      setIsAuthenticated(!!session)
      setSignedInViaOrcid(isOrcidSession(session?.user))
    })
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsAuthenticated(!!session)
      setSignedInViaOrcid(isOrcidSession(session?.user))
    })
    return () => subscription.unsubscribe()
  }, [pathname])

  useEffect(() => {
    if (!isAuthenticated) {
      setCanViewLogs(null)
      return
    }
    let cancelled = false
    fetch('/api/audit/access')
      .then((r) => (r.ok ? r.json() : { canViewLogs: false }))
      .then((d: { canViewLogs?: boolean }) => {
        if (!cancelled) setCanViewLogs(Boolean(d?.canViewLogs))
      })
      .catch(() => {
        if (!cancelled) setCanViewLogs(false)
      })
    return () => {
      cancelled = true
    }
  }, [isAuthenticated])

  useEffect(() => {
    if (!isAuthenticated) {
      setHasActiveAuditorEngagement(null)
      return
    }
    let cancelled = false
    fetch('/api/auditor/access')
      .then((r) => (r.ok ? r.json() : { hasActiveEngagement: false }))
      .then((d: { hasActiveEngagement?: boolean }) => {
        if (!cancelled) setHasActiveAuditorEngagement(Boolean(d?.hasActiveEngagement))
      })
      .catch(() => {
        if (!cancelled) setHasActiveAuditorEngagement(false)
      })
    return () => {
      cancelled = true
    }
  }, [isAuthenticated])

  useEffect(() => {
    if (!isAuthenticated) {
      setOrcidIdentity(null)
      return
    }
    let cancelled = false
    fetch('/api/profile', { credentials: 'same-origin' })
      .then((r) => (r.ok ? r.json() : null))
      .then(
        (
          d: {
            profile?: { orcid_id?: string | null; orcid_verified?: boolean | null } | null
          } | null
        ) => {
          if (cancelled) return
          const id = d?.profile?.orcid_id ?? null
          if (!id) {
            setOrcidIdentity(null)
            return
          }
          setOrcidIdentity({
            orcidId: id,
            verified: Boolean(d?.profile?.orcid_verified),
            signedInViaOrcid,
          })
        }
      )
      .catch(() => {
        if (!cancelled) setOrcidIdentity(null)
      })
    return () => {
      cancelled = true
    }
  }, [isAuthenticated, signedInViaOrcid])

  return (
    <NavContext.Provider
      value={{
        isOpen,
        setIsOpen,
        isAuthenticated,
        canViewLogs,
        hasActiveAuditorEngagement,
        orcidIdentity,
      }}
    >
      {children}
    </NavContext.Provider>
  )
}

function isOrcidSession(user: { app_metadata?: Record<string, unknown> } | null | undefined): boolean {
  if (!user) return false
  const meta = user.app_metadata ?? {}
  const primary = typeof meta.provider === 'string' ? meta.provider : ''
  const providers = Array.isArray(meta.providers) ? meta.providers : []
  if (primary.startsWith('custom:orcid') || primary === 'orcid') return true
  return providers.some(
    (p) => typeof p === 'string' && (p.startsWith('custom:orcid') || p === 'orcid')
  )
}
