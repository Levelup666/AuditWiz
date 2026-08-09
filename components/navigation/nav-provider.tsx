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
  /** Null while loading; membership + engagement (context switch available). */
  dualRole: boolean | null
  /** Null while loading; preferred shell when dual-role (or forced when auditor-primary). */
  activeContext: 'auditor' | 'member' | null
  /** Null while loading; whether UI should present the auditor shell. */
  presentAuditorShell: boolean | null
  /** Switch dual-role context; no-op when not dual-role. */
  setActiveContext: (context: 'auditor' | 'member') => Promise<void>
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
  const [dualRole, setDualRole] = useState<boolean | null>(null)
  const [activeContext, setActiveContextState] = useState<'auditor' | 'member' | null>(null)
  const [presentAuditorShell, setPresentAuditorShell] = useState<boolean | null>(null)
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
      setDualRole(null)
      setActiveContextState(null)
      setPresentAuditorShell(null)
      return
    }
    let cancelled = false
    fetch('/api/auditor/access')
      .then((r) =>
        r.ok
          ? r.json()
          : {
              hasActiveEngagement: false,
              auditorPrimary: false,
              dualRole: false,
              activeContext: null,
              presentAuditorShell: false,
            }
      )
      .then(
        (d: {
          hasActiveEngagement?: boolean
          auditorPrimary?: boolean
          dualRole?: boolean
          activeContext?: 'auditor' | 'member' | null
          presentAuditorShell?: boolean
        }) => {
          if (!cancelled) {
            setHasActiveAuditorEngagement(Boolean(d?.hasActiveEngagement))
            setAuditorPrimary(Boolean(d?.auditorPrimary))
            setDualRole(Boolean(d?.dualRole))
            setActiveContextState(d?.activeContext ?? null)
            setPresentAuditorShell(Boolean(d?.presentAuditorShell))
          }
        }
      )
      .catch(() => {
        if (!cancelled) {
          setHasActiveAuditorEngagement(false)
          setAuditorPrimary(false)
          setDualRole(false)
          setActiveContextState(null)
          setPresentAuditorShell(false)
        }
      })
    return () => {
      cancelled = true
    }
  }, [isAuthenticated, pathname])

  async function setActiveContext(context: 'auditor' | 'member') {
    const res = await fetch('/api/auditor/context', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ context }),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      throw new Error(data.error || res.statusText)
    }
    setActiveContextState(context)
    setPresentAuditorShell(context === 'auditor')
  }

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
        dualRole,
        activeContext,
        presentAuditorShell,
        setActiveContext,
        orcidIdentity,
        unreadNotificationCount,
      }}
    >
      {children}
    </NavContext.Provider>
  )
}
