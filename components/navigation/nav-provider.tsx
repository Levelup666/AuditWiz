'use client'

import { createContext, useContext, useState } from 'react'

type NavContextType = { isOpen: boolean; setIsOpen: React.Dispatch<React.SetStateAction<boolean>> }
const NavContext = createContext<NavContextType | null>(null)

export function useNavContext() {
  const ctx = useContext(NavContext)
  return ctx
}

export default function NavProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false)
  return (
    <NavContext.Provider value={{ isOpen, setIsOpen }}>
      {children}
    </NavContext.Provider>
  )
}
