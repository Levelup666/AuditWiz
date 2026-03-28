import { createClient } from '@/lib/supabase/server'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import StudiesListToolbar from '@/components/studies/studies-list-toolbar'

interface StudiesListProps {
  userId: string
  statusFilter?: string
  institutionFilter?: string
  institutions?: Array<{ id: string; name: string }>
}

export default async function StudiesList({
  userId,
  statusFilter,
  institutionFilter,
  institutions = [],
}: StudiesListProps) {
  const supabase = await createClient()

  // Fetch studies where user is a member
  let query = supabase
    .from('studies')
    .select(`
      *,
      study_members!inner(role)
    `)
    .eq('study_members.user_id', userId)
    .is('study_members.revoked_at', null)
    .order('updated_at', { ascending: false })

  if (statusFilter) {
    query = query.eq('status', statusFilter)
  }
  if (institutionFilter) {
    query = query.eq('institution_id', institutionFilter)
  }

  const { data: studies, error } = await query

  if (error) {
    return <div className="text-red-600">Error loading studies: {error.message}</div>
  }

  if (!studies || studies.length === 0) {
    return (
      <div className="py-12 text-center">
        <p className="text-gray-500">
          {statusFilter ? 'No studies match the selected filter.' : 'No studies yet. Create your first study to get started.'}
        </p>
      </div>
    )
  }

  const studyIds = studies.map((s: any) => s.id)

  // Fetch latest record per record_number for each study to compute stats
  const { data: records } = await supabase
    .from('records')
    .select('id, study_id, record_number, version, status')
    .in('study_id', studyIds)

  const recordCountByStudy: Record<string, number> = {}
  const hasUnapprovedByStudy: Record<string, boolean> = {}
  studyIds.forEach((id: string) => {
    recordCountByStudy[id] = 0
    hasUnapprovedByStudy[id] = false
  })
  const latestByRecord: Record<string, any> = {}
    ;(records || []).forEach((r: any) => {
    const key = `${r.study_id}-${r.record_number}`
    const existing = latestByRecord[key]
    if (!existing || r.version > existing.version) {
      latestByRecord[key] = r
    }
  })
  Object.values(latestByRecord).forEach((r: any) => {
    if (recordCountByStudy[r.study_id] !== undefined) {
      recordCountByStudy[r.study_id]++
    }
    if (r.status !== 'approved') {
      hasUnapprovedByStudy[r.study_id] = true
    }
  })

  const getStatusBadge = (status: string) => {
    const styles = {
      draft: 'bg-gray-100 text-gray-800',
      active: 'bg-green-100 text-green-800',
      completed: 'bg-blue-100 text-blue-800',
      archived: 'bg-gray-100 text-gray-600',
    }
    return (
      <Badge className={styles[status as keyof typeof styles] || styles.draft}>
        {status}
      </Badge>
    )
  }

  const truncateDoc = (doc: string | null | undefined, len = 60) => {
    if (!doc?.trim()) return '—'
    const t = doc.trim().replace(/\s+/g, ' ')
    return t.length <= len ? t : t.slice(0, len) + '…'
  }

  return (
    <>
      <StudiesListToolbar
        statusFilter={statusFilter}
        institutionFilter={institutionFilter}
        institutions={institutions}
      />
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Title</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Records</TableHead>
            <TableHead>Pending approval</TableHead>
            <TableHead>Your Role</TableHead>
            <TableHead>Last activity</TableHead>
            <TableHead>Documentation</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {studies.map((study: any) => {
            const recordTotal = recordCountByStudy[study.id] ?? 0
            const hasUnapproved = hasUnapprovedByStudy[study.id] ?? false
            return (
              <TableRow key={study.id}>
                <TableCell className="font-medium">{study.title}</TableCell>
                <TableCell>{getStatusBadge(study.status)}</TableCell>
                <TableCell>
                  <span className="text-sm tabular-nums">{recordTotal}</span>
                </TableCell>
                <TableCell>
                  {hasUnapproved ? (
                    <Badge className="bg-amber-100 text-amber-900 hover:bg-amber-100">
                      Unapproved records
                    </Badge>
                  ) : (
                    <span className="text-sm text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell>
                  <Badge variant="outline">{study.study_members[0]?.role || 'member'}</Badge>
                </TableCell>
                <TableCell>{new Date(study.updated_at).toLocaleDateString()}</TableCell>
                <TableCell className="max-w-[200px] text-sm text-gray-600 truncate">
                  {truncateDoc(study.documentation)}
                </TableCell>
                <TableCell className="text-right">
                  <Link href={`/studies/${study.id}`}>
                    <Button variant="outline" size="sm">
                      View
                    </Button>
                  </Link>
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </>
  )
}
