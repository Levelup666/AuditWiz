import { createClient } from '@/lib/supabase/server'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import StudiesListToolbar from '@/components/studies/studies-list-toolbar'

interface StudiesListProps {
  userId: string
  statusFilter?: string
}

export default async function StudiesList({ userId, statusFilter }: StudiesListProps) {
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

  const statsByStudy: Record<string, { total: number; draft: number; submitted: number; approved: number }> = {}
  studyIds.forEach((id: string) => {
    statsByStudy[id] = { total: 0, draft: 0, submitted: 0, approved: 0 }
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
    const s = statsByStudy[r.study_id]
    if (s) {
      s.total++
      if (r.status === 'draft') s.draft++
      else if (r.status === 'submitted' || r.status === 'under_review') s.submitted++
      else if (r.status === 'approved') s.approved++
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
      <StudiesListToolbar statusFilter={statusFilter} />
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Title</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Records</TableHead>
            <TableHead>Your Role</TableHead>
            <TableHead>Last activity</TableHead>
            <TableHead>Documentation</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {studies.map((study: any) => {
            const stats = statsByStudy[study.id] ?? { total: 0, draft: 0, submitted: 0, approved: 0 }
            return (
              <TableRow key={study.id}>
                <TableCell className="font-medium">{study.title}</TableCell>
                <TableCell>{getStatusBadge(study.status)}</TableCell>
                <TableCell>
                  <span className="text-sm">
                    {stats.total} total
                    {(stats.draft > 0 || stats.submitted > 0 || stats.approved > 0) && (
                      <span className="text-gray-500 ml-1">
                        ({stats.draft} draft, {stats.submitted} in review, {stats.approved} approved)
                      </span>
                    )}
                  </span>
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
