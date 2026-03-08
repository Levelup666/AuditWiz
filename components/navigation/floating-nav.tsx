'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import {
  FolderOpen,
  LogOut,
  Home,
  Activity,
  User,
  Menu,
  ChevronLeft,
} from 'lucide-react'
import { cn } from '@/lib/utils'

const navigation = [
  { name: 'Studies', href: '/studies', icon: FolderOpen },
  { name: 'Dashboard', href: '/dashboard', icon: Home },
  { name: 'Audit Trail', href: '/dashboard/audit-trail', icon: Activity },
  { name: 'Profile', href: '/profile', icon: User },
]

export default function FloatingNav() {
  const pathname = usePathname()
  const router = useRouter()
  const [isOpen, setIsOpen] = useState(false)

  const handleSignOut = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/auth/signin')
    router.refresh()
  }

  return (
    <nav
      className={cn(
        'fixed left-0 top-1/2 z-50 flex -translate-y-1/2 flex-col rounded-r-lg border border-l-0 border-gray-700 bg-gray-900 shadow-lg transition-all duration-300 ease-in-out',
        isOpen ? 'w-56' : 'w-12'
      )}
    >
      {/* Toggle button */}
      <button
        type="button"
        onClick={() => setIsOpen((o) => !o)}
        className="flex h-12 w-full items-center justify-center border-b border-gray-800 text-gray-300 hover:bg-gray-800 hover:text-white"
        aria-label={isOpen ? 'Collapse navigation' : 'Expand navigation'}
      >
        {isOpen ? (
          <ChevronLeft className="h-5 w-5" />
        ) : (
          <Menu className="h-5 w-5" />
        )}
      </button>

      {isOpen && (
        <>
          <div className="flex h-12 items-center justify-center border-b border-gray-800 px-3">
            <span className="truncate text-sm font-bold text-white">
              AuditWiz
            </span>
          </div>
          <div className="flex-1 space-y-1 overflow-y-auto px-2 py-3">
            {navigation.map((item) => {
              const isActive = pathname?.startsWith(item.href)
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  className={cn(
                    'flex items-center rounded-md px-3 py-2 text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-gray-800 text-white'
                      : 'text-gray-300 hover:bg-gray-800 hover:text-white'
                  )}
                  onClick={() => setIsOpen(false)}
                >
                  <item.icon
                    className={cn(
                      'mr-3 h-5 w-5 flex-shrink-0',
                      isActive ? 'text-white' : 'text-gray-400'
                    )}
                  />
                  <span className="truncate">{item.name}</span>
                </Link>
              )
            })}
          </div>
          <div className="border-t border-gray-800 p-2">
            <Button
              onClick={handleSignOut}
              variant="ghost"
              size="sm"
              className="w-full justify-start text-gray-300 hover:bg-gray-800 hover:text-white"
            >
              <LogOut className="mr-3 h-5 w-5 flex-shrink-0" />
              <span className="truncate">Sign out</span>
            </Button>
          </div>
        </>
      )}
    </nav>
  )
}
