'use client'

import { useRouter, usePathname } from 'next/navigation'
import { Filter } from 'lucide-react'

const STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'draft', label: 'Draft' },
  { value: 'active', label: 'Active' },
  { value: 'completed', label: 'Completed' },
  { value: 'archived', label: 'Archived' },
]

interface StudiesListToolbarProps {
  statusFilter?: string
}

export default function StudiesListToolbar({ statusFilter = '' }: StudiesListToolbarProps) {
  const router = useRouter()
  const pathname = usePathname()

  function updateStatus(value: string) {
    const params = new URLSearchParams()
    if (value) params.set('status', value)
    const qs = params.toString()
    router.push(pathname + (qs ? `?${qs}` : ''))
  }

  return (
    <div className="flex flex-wrap items-center gap-2 mb-4">
      <div className="flex items-center gap-2">
        <Filter className="h-4 w-4 text-gray-500" />
        <select
          value={statusFilter}
          onChange={(e) => updateStatus(e.target.value)}
          className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm"
        >
          {STATUS_OPTIONS.map((opt) => (
            <option key={opt.value || '_all'} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  )
}
