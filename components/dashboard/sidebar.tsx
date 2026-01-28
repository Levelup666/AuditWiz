'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import {
  FileText,
  FolderOpen,
  List,
  LogOut,
  Home,
  Activity,
} from 'lucide-react'
import { cn } from '@/lib/utils'

const navigation = [
  { name: 'Studies', href: '/studies', icon: FolderOpen },
  { name: 'Dashboard', href: '/dashboard', icon: Home },
  { name: 'Audit Trail', href: '/dashboard/audit-trail', icon: Activity },
]

export default function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()

  const handleSignOut = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/auth/signin')
    router.refresh()
  }

  return (
    <div className="flex h-full w-64 flex-col bg-gray-900">
      <div className="flex h-16 items-center justify-center border-b border-gray-800">
        <h1 className="text-xl font-bold text-white">AuditWiz</h1>
      </div>
      <nav className="flex-1 space-y-1 px-3 py-4">
        {navigation.map((item) => {
          const isActive = pathname?.startsWith(item.href)
          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                'group flex items-center rounded-md px-3 py-2 text-sm font-medium',
                isActive
                  ? 'bg-gray-800 text-white'
                  : 'text-gray-300 hover:bg-gray-800 hover:text-white'
              )}
            >
              <item.icon
                className={cn(
                  'mr-3 h-5 w-5 flex-shrink-0',
                  isActive ? 'text-white' : 'text-gray-400 group-hover:text-gray-300'
                )}
              />
              {item.name}
            </Link>
          )
        })}
      </nav>
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
    </div>
  )
}
