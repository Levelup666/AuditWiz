'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

type NavContextType = {
  isOpen: boolean
  setIsOpen: React.Dispatch<React.SetStateAction<boolean>>
  /** True when user has an active session; sidebar and shell margin apply only then */
  isAuthenticated: boolean
}
const NavContext = createContext<NavContextType | null>(null)

export function useNavContext() {
  const ctx = useContext(NavContext)
  return ctx
}

export default function NavProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false)
  const [isAuthenticated, setIsAuthenticated] = useState(false)

  useEffect(() => {
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
  }, [])

  return (
    <NavContext.Provider value={{ isOpen, setIsOpen, isAuthenticated }}>
      {children}
    </NavContext.Provider>
  )
}
