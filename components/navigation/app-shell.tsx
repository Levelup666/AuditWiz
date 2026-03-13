'use client'

import { useNavContext } from './nav-provider'
import { cn } from '@/lib/utils'

export default function AppShell({ children }: { children: React.ReactNode }) {
  const ctx = useNavContext()

  return (
    <div
      className={cn(
        'min-h-screen bg-gray-100 p-6 transition-[margin-left] duration-300 ease-in-out',
        ctx ? (ctx.isOpen ? 'ml-64' : 'ml-12') : 'ml-12'
      )}
    >
      {children}
    </div>
  )
}
