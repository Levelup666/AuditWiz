'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { userSignedInViaOrcid } from '@/lib/auth/is-orcid-auth'

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
  /** Null while loading; engagement-only user (no study/institution membership). */
  auditorPrimary: boolean | null
  /** Null while loading; verified ORCID linked to the current account (if any). */
  orcidIdentity: OrcidSessionIdentity | null
  /** Null while loading; unread in-app notification count. */
  unreadNotificationCount: number | null
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
  const [auditorPrimary, setAuditorPrimary] = useState<boolean | null>(null)
  const [signedInViaOrcid, setSignedInViaOrcid] = useState<boolean>(false)
  const [orcidIdentity, setOrcidIdentity] = useState<OrcidSessionIdentity | null>(null)
  const [unreadNotificationCount, setUnreadNotificationCount] = useState<number | null>(null)

  useEffect(() => {
    if (pathname?.startsWith('/auth/callback')) {
      return
    }

    const supabase = createClient()
    supabase.auth.getSession().then(({ data: { session } }) => {
      setIsAuthenticated(!!session)
      setSignedInViaOrcid(userSignedInViaOrcid(session?.user ?? {}))
    })
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsAuthenticated(!!session)
      setSignedInViaOrcid(userSignedInViaOrcid(session?.user ?? {}))
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
      setAuditorPrimary(null)
      return
    }
    let cancelled = false
    fetch('/api/auditor/access')
      .then((r) => (r.ok ? r.json() : { hasActiveEngagement: false, auditorPrimary: false }))
      .then((d: { hasActiveEngagement?: boolean; auditorPrimary?: boolean }) => {
        if (!cancelled) {
          setHasActiveAuditorEngagement(Boolean(d?.hasActiveEngagement))
          setAuditorPrimary(Boolean(d?.auditorPrimary))
        }
      })
      .catch(() => {
        if (!cancelled) {
          setHasActiveAuditorEngagement(false)
          setAuditorPrimary(false)
        }
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

  useEffect(() => {
    if (!isAuthenticated) {
      setUnreadNotificationCount(null)
      return
    }
    let cancelled = false
    fetch('/api/notifications/unread-count')
      .then((r) => (r.ok ? r.json() : { count: 0 }))
      .then((d: { count?: number }) => {
        if (!cancelled) setUnreadNotificationCount(typeof d?.count === 'number' ? d.count : 0)
      })
      .catch(() => {
        if (!cancelled) setUnreadNotificationCount(0)
      })
    return () => {
      cancelled = true
    }
  }, [isAuthenticated, pathname])

  return (
    <NavContext.Provider
      value={{
        isOpen,
        setIsOpen,
        isAuthenticated,
        canViewLogs,
        hasActiveAuditorEngagement,
        auditorPrimary,
        orcidIdentity,
        unreadNotificationCount,
      }}
    >
      {children}
    </NavContext.Provider>
  )
}
