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
  Building2,
  ShieldCheck,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useNavContext, type OrcidSessionIdentity } from './nav-provider'
import InvitesNavLink from './invites-nav-link'
import { isNavActive } from './is-nav-active'
import OrcidBadge from '@/components/profile/orcid-badge'

const baseNavigation = [
  { name: 'Studies', href: '/studies', icon: FolderOpen },
  { name: 'Institutions', href: '/institutions', icon: Building2 },
  { name: 'Dashboard', href: '/dashboard', icon: Home },
  { name: 'Profile', href: '/profile', icon: User },
] as const

const logsNavItem = {
  name: 'Logs',
  href: '/logs',
  icon: Activity,
} as const

const auditorNavItem = {
  name: 'Auditor',
  href: '/auditor',
  icon: ShieldCheck,
} as const

type NavItem =
  | (typeof baseNavigation)[number]
  | typeof logsNavItem
  | typeof auditorNavItem

function FloatingNavItem({
  item,
  pathname,
  collapsed,
  onNavigate,
  navItems,
}: {
  item: NavItem
  pathname: string | null
  collapsed: boolean
  onNavigate: () => void
  navItems: readonly { href: string }[]
}) {
  const isActive = isNavActive(pathname, item.href, navItems)
  if (collapsed) {
    return (
      <Link
        href={item.href}
        className={cn(
          'mb-2 flex h-10 w-10 items-center justify-center rounded-md transition-colors',
          isActive
            ? 'bg-gray-800 text-white'
            : 'text-gray-400 hover:bg-gray-800 hover:text-white'
        )}
        title={item.name}
        aria-current={isActive ? 'page' : undefined}
      >
        <item.icon className="h-5 w-5" />
      </Link>
    )
  }
  return (
    <Link
      href={item.href}
      className={cn(
        'group flex items-center rounded-md px-3 py-2 text-sm font-medium transition-colors',
        isActive
          ? 'bg-gray-800 text-white'
          : 'text-gray-300 hover:bg-gray-800 hover:text-white'
      )}
      onClick={onNavigate}
      aria-current={isActive ? 'page' : undefined}
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
}

export default function FloatingNav() {
  const pathname = usePathname()
  const router = useRouter()
  const ctx = useNavContext()
  const {
    isOpen,
    setIsOpen,
    isAuthenticated,
    canViewLogs,
    hasActiveAuditorEngagement,
    orcidIdentity,
  } = ctx ?? {
    isOpen: false,
    setIsOpen: () => {},
    isAuthenticated: false,
    canViewLogs: false,
    hasActiveAuditorEngagement: false,
    orcidIdentity: null as OrcidSessionIdentity | null,
  }

  if (!isAuthenticated) {
    return null
  }

  if (pathname?.startsWith('/auth')) {
    return null
  }

  const navigation: NavItem[] = [
    ...baseNavigation.slice(0, 3),
    ...(canViewLogs ? [logsNavItem] : []),
    ...(hasActiveAuditorEngagement ? [auditorNavItem] : []),
    baseNavigation[3],
  ]

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
              {navigation.map((item) => (
                <FloatingNavItem
                  key={item.name}
                  item={item}
                  pathname={pathname}
                  collapsed={false}
                  onNavigate={() => setIsOpen(false)}
                  navItems={navigation}
                />
              ))}
              <InvitesNavLink isOpen onNavigate={() => setIsOpen(false)} />
            </div>
            <OrcidNavBadge identity={orcidIdentity} collapsed={false} />
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
            {navigation.map((item) => (
              <FloatingNavItem
                key={item.name}
                item={item}
                pathname={pathname}
                collapsed
                onNavigate={() => setIsOpen(false)}
                navItems={navigation}
              />
            ))}
            <InvitesNavLink
              isOpen={false}
              collapsed
              onNavigate={() => setIsOpen(false)}
            />
            <div className="mt-auto flex flex-col items-center gap-2 border-t border-gray-800 p-2">
              <OrcidNavBadge identity={orcidIdentity} collapsed />
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

function OrcidNavBadge({
  identity,
  collapsed,
}: {
  identity: OrcidSessionIdentity | null
  collapsed: boolean
}) {
  if (!identity?.verified || !identity.orcidId) return null

  if (collapsed) {
    return (
      <div
        className="flex items-center justify-center"
        title={`Signed in with ORCID ${identity.orcidId}`}
      >
        <OrcidBadge orcidId={identity.orcidId} verified />
      </div>
    )
  }

  return (
    <div className="border-t border-gray-800 px-4 py-3">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">
        {identity.signedInViaOrcid ? 'Signed in with ORCID' : 'Verified ORCID'}
      </div>
      <div className="mt-1 flex items-center gap-2">
        <OrcidBadge orcidId={identity.orcidId} verified />
        <Link
          href={`https://orcid.org/${identity.orcidId}`}
          target="_blank"
          rel="noopener noreferrer"
          className="font-mono text-xs text-gray-300 hover:text-white hover:underline"
        >
          {identity.orcidId}
        </Link>
      </div>
    </div>
  )
}
