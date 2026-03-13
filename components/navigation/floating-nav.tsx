'use client'

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
import { useNavContext } from './nav-provider'

const navigation = [
  { name: 'Studies', href: '/studies', icon: FolderOpen },
  { name: 'Dashboard', href: '/dashboard', icon: Home },
  { name: 'Audit Trail', href: '/dashboard/audit-trail', icon: Activity },
  { name: 'Profile', href: '/profile', icon: User },
]

export default function FloatingNav() {
  const pathname = usePathname()
  const router = useRouter()
  const { isOpen, setIsOpen } = useNavContext() ?? { isOpen: false, setIsOpen: () => {} }

  const handleSignOut = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/auth/signin')
    router.refresh()
  }

  return (
    <nav
        className={cn(
          'fixed left-0 top-0 z-50 flex h-screen flex-col border-r border-gray-700 bg-gray-900 shadow-lg transition-all duration-300 ease-in-out',
          isOpen ? 'w-64' : 'w-12'
        )}
      >
        {/* Toggle button */}
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="flex h-16 w-full items-center justify-center border-b border-gray-800 text-gray-300 hover:bg-gray-800 hover:text-white"
          aria-label={isOpen ? 'Collapse navigation' : 'Expand navigation'}
        >
          {isOpen ? (
            <ChevronLeft className="h-5 w-5" />
          ) : (
            <Menu className="h-5 w-5" />
          )}
        </button>

        {isOpen ? (
          <>
            <div className="flex h-12 items-center justify-center border-b border-gray-800 px-3">
              <span className="truncate text-xl font-bold text-white">
                AuditWiz
              </span>
            </div>
            <div className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
              {navigation.map((item) => {
                const isActive = pathname?.startsWith(item.href)
                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    className={cn(
                      'group flex items-center rounded-md px-3 py-2 text-sm font-medium transition-colors',
                      isActive
                        ? 'bg-gray-800 text-white'
                        : 'text-gray-300 hover:bg-gray-800 hover:text-white'
                    )}
                    onClick={() => setIsOpen(false)}
                  >
                    <item.icon
                      className={cn(
                        'mr-3 h-5 w-5 flex-shrink-0',
                        isActive ? 'text-white' : 'text-gray-400 group-hover:text-gray-300'
                      )}
                    />
                    <span className="truncate">{item.name}</span>
                  </Link>
                )
              })}
            </div>
            <div className="border-t border-gray-800 p-4">
              <Button
                onClick={handleSignOut}
                variant="ghost"
                className="w-full justify-start text-gray-300 hover:bg-gray-800 hover:text-white"
              >
                <LogOut className="mr-3 h-5 w-5" />
                Sign out
              </Button>
            </div>
          </>
        ) : (
          <div className="flex flex-1 flex-col items-center pt-4">
            {navigation.map((item) => {
              const isActive = pathname?.startsWith(item.href)
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  className={cn(
                    'mb-2 flex h-10 w-10 items-center justify-center rounded-md transition-colors',
                    isActive
                      ? 'bg-gray-800 text-white'
                      : 'text-gray-400 hover:bg-gray-800 hover:text-white'
                  )}
                  title={item.name}
                >
                  <item.icon className="h-5 w-5" />
                </Link>
              )
            })}
            <div className="mt-auto border-t border-gray-800 p-2">
              <Button
                onClick={handleSignOut}
                variant="ghost"
                size="icon"
                className="h-10 w-10 text-gray-400 hover:bg-gray-800 hover:text-white"
                title="Sign out"
              >
                <LogOut className="h-5 w-5" />
              </Button>
            </div>
          </div>
        )}
      </nav>
  )
}
