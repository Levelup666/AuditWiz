'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

type NavContextType = {
  isOpen: boolean
  setIsOpen: React.Dispatch<React.SetStateAction<boolean>>
  /** True when user has an active session; sidebar and shell margin apply only then */
  isAuthenticated: boolean
  /** Null while loading; whether the Logs hub is available (auditor/admin on ≥1 study). */
  canViewLogs: boolean | null
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

  useEffect(() => {
    // PKCE browser client rejects implicit #access_token URLs during init ("Not a valid PKCE flow url").
    // /auth/callback parses the hash with a dedicated implicit client first, then setSession on the app client.
    if (pathname?.startsWith('/auth/callback')) {
      return
    }

    const supabase = createClient()
    supabase.auth.getSession().then(({ data: { session } }) => {
      setIsAuthenticated(!!session)
    })
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsAuthenticated(!!session)
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

  return (
    <NavContext.Provider value={{ isOpen, setIsOpen, isAuthenticated, canViewLogs }}>
      {children}
    </NavContext.Provider>
  )
}
