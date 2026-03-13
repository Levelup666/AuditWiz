'use client'

import { useRouter, usePathname } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Filter, ArrowUpDown } from 'lucide-react'

const STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'draft', label: 'Draft' },
  { value: 'submitted', label: 'Submitted' },
  { value: 'under_review', label: 'Under review' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
]

const SORT_OPTIONS = [
  { value: 'record_number', label: 'Record number' },
  { value: 'created_at', label: 'Created date' },
  { value: 'last_edited_at', label: 'Last edited' },
]

interface RecordsListToolbarProps {
  statusFilter?: string
  sortBy?: string
}

export default function RecordsListToolbar({
  statusFilter = '',
  sortBy = 'record_number',
}: RecordsListToolbarProps) {
  const router = useRouter()
  const pathname = usePathname()

  function updateParams(updates: { status?: string; sort?: string }) {
    const params = new URLSearchParams()
    if (updates.status !== undefined) {
      if (updates.status) params.set('status', updates.status)
    } else if (statusFilter) params.set('status', statusFilter)
    if (updates.sort !== undefined) {
      if (updates.sort) params.set('sort', updates.sort)
    } else if (sortBy) params.set('sort', sortBy)
    const qs = params.toString()
    router.push(pathname + (qs ? `?${qs}` : ''))
  }

  return (
    <div className="flex flex-wrap items-center gap-2 mb-4">
      <div className="flex items-center gap-2">
        <Filter className="h-4 w-4 text-gray-500" />
        <select
          value={statusFilter}
          onChange={(e) => updateParams({ status: e.target.value })}
          className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm"
        >
          {STATUS_OPTIONS.map((opt) => (
            <option key={opt.value || '_all'} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>
      <div className="flex items-center gap-2">
        <ArrowUpDown className="h-4 w-4 text-gray-500" />
        <select
          value={sortBy}
          onChange={(e) => updateParams({ sort: e.target.value })}
          className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm"
        >
          {SORT_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  )
}
