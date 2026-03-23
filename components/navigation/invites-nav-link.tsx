'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { Mail } from 'lucide-react'
import { cn } from '@/lib/utils'

interface InvitesNavLinkProps {
  isOpen: boolean
  onNavigate: () => void
  /** Icon-only rail (collapsed sidebar). */
  collapsed?: boolean
}

export default function InvitesNavLink({
  isOpen,
  onNavigate,
  collapsed = false,
}: InvitesNavLinkProps) {
  const pathname = usePathname()
  const [total, setTotal] = useState(0)

  useEffect(() => {
    let cancelled = false
    fetch('/api/invites/summary')
      .then((r) => r.json())
      .then((d: { total?: number }) => {
        if (!cancelled && typeof d.total === 'number') setTotal(d.total)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  const isActive = pathname?.startsWith('/invites')

  if (collapsed) {
    return (
      <Link
        href="/invites"
        className={cn(
          'relative mb-2 flex h-10 w-10 items-center justify-center rounded-md transition-colors',
          isActive
            ? 'bg-gray-800 text-white'
            : 'text-gray-400 hover:bg-gray-800 hover:text-white'
        )}
        title={total > 0 ? `Invites (${total} pending)` : 'Invites'}
        onClick={onNavigate}
      >
        <Mail className="h-5 w-5" />
        {total > 0 ? (
          <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-amber-500 ring-2 ring-gray-900" />
        ) : null}
      </Link>
    )
  }

  return (
    <Link
      href="/invites"
      className={cn(
        'group flex items-center rounded-md px-3 py-2 text-sm font-medium transition-colors',
        isActive
          ? 'bg-gray-800 text-white'
          : 'text-gray-300 hover:bg-gray-800 hover:text-white'
      )}
      onClick={onNavigate}
    >
      <Mail
        className={cn(
          'mr-3 h-5 w-5 flex-shrink-0',
          isActive ? 'text-white' : 'text-gray-400 group-hover:text-gray-300'
        )}
      />
      {isOpen ? (
        <span className="flex min-w-0 flex-1 items-center justify-between gap-2 truncate">
          <span className="truncate">Invites</span>
          {total > 0 ? (
            <span className="shrink-0 rounded-full bg-amber-600 px-2 py-0.5 text-xs font-semibold text-white">
              {total > 99 ? '99+' : total}
            </span>
          ) : null}
        </span>
      ) : null}
    </Link>
  )
}
