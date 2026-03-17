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
  institutionFilter?: string
  institutions?: Array<{ id: string; name: string }>
}

export default function StudiesListToolbar({
  statusFilter = '',
  institutionFilter = '',
  institutions = [],
}: StudiesListToolbarProps) {
  const router = useRouter()
  const pathname = usePathname()

  function updateFilters(status: string, institution: string) {
    const params = new URLSearchParams()
    if (status) params.set('status', status)
    if (institution) params.set('institution', institution)
    const qs = params.toString()
    router.push(pathname + (qs ? `?${qs}` : ''))
  }

  return (
    <div className="flex flex-wrap items-center gap-2 mb-4">
      <div className="flex flex-wrap items-center gap-2">
        <Filter className="h-4 w-4 text-gray-500" />
        <select
          value={statusFilter}
          onChange={(e) => updateFilters(e.target.value, institutionFilter)}
          className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm"
        >
          {STATUS_OPTIONS.map((opt) => (
            <option key={opt.value || '_all'} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        {institutions.length > 0 && (
          <select
            value={institutionFilter}
            onChange={(e) => updateFilters(statusFilter, e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm"
          >
            <option value="">All institutions</option>
            {institutions.map((inst) => (
              <option key={inst.id} value={inst.id}>
                {inst.name}
              </option>
            ))}
          </select>
        )}
      </div>
    </div>
  )
}
