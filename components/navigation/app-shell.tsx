'use client'

import { usePathname } from 'next/navigation'
import { useNavContext } from './nav-provider'
import { cn } from '@/lib/utils'

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const ctx = useNavContext()
  const isAuthenticated = ctx?.isAuthenticated ?? false
  const navOpen = ctx?.isOpen ?? false
  const showNavMargin =
    isAuthenticated && !pathname?.startsWith('/auth')

  return (
    <div
      className={cn(
        'min-h-screen bg-gray-100 p-6 transition-[margin-left] duration-300 ease-in-out',
        showNavMargin ? (navOpen ? 'ml-64' : 'ml-12') : 'ml-0'
      )}
    >
      {children}
    </div>
  )
}
