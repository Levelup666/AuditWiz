'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Download } from 'lucide-react'
import Link from 'next/link'

interface Study {
  id: string
  title: string
}

interface AuditTrailFiltersProps {
  studies: Study[]
}

export default function AuditTrailFilters({ studies }: AuditTrailFiltersProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const studyId = searchParams.get('studyId') ?? ''

  const handleStudyChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value
    const params = new URLSearchParams(searchParams.toString())
    if (value) {
      params.set('studyId', value)
    } else {
      params.delete('studyId')
    }
    router.push(`/logs?${params.toString()}`)
  }

  const exportHref = `/api/audit/export?format=csv${studyId ? `&studyId=${studyId}` : ''}`

  return (
    <div className="flex flex-wrap items-end gap-4">
      <div>
        <Label htmlFor="study-filter" className="text-sm font-medium">
          Filter by study
        </Label>
        <select
          id="study-filter"
          value={studyId}
          onChange={handleStudyChange}
          className="mt-1 block w-48 rounded-md border border-input bg-background px-3 py-2 text-sm"
        >
          <option value="">All studies</option>
          {studies.map((s) => (
            <option key={s.id} value={s.id}>
              {s.title}
            </option>
          ))}
        </select>
      </div>
      <Link href={exportHref} download>
        <Button variant="outline" size="sm">
          <Download className="mr-2 h-4 w-4" />
          Export CSV
        </Button>
      </Link>
    </div>
  )
}
