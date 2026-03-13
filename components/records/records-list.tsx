import { createClient } from '@/lib/supabase/server'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import RecordsListToolbar from '@/components/records/records-list-toolbar'

interface RecordsListProps {
  studyId: string
  statusFilter?: string
  sortBy?: string
}

export default async function RecordsList({
  studyId,
  statusFilter,
  sortBy = 'record_number',
}: RecordsListProps) {
  const supabase = await createClient()

  // Fetch latest version of each record
  let query = supabase
    .from('records')
    .select('*')
    .eq('study_id', studyId)
    .order('record_number', { ascending: true })
    .order('version', { ascending: false })

  const { data: records, error } = await query

  if (error) {
    return <div className="text-red-600">Error loading records: {error.message}</div>
  }

  if (!records || records.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-12 text-center">
        <p className="text-gray-500">No records yet. Create your first record to get started.</p>
        <Link href={`/studies/${studyId}/records/new`}>
          <Button size="sm">Create your first record</Button>
        </Link>
      </div>
    )
  }

  // Group by record_number and get latest version
  const latestRecords = records.reduce((acc: Record<string, any>, record: any) => {
    if (!acc[record.record_number] || acc[record.record_number].version < record.version) {
      acc[record.record_number] = record
    }
    return acc
  }, {})

  let recordArray = Object.values(latestRecords)

  // Filter by status
  if (statusFilter) {
    recordArray = recordArray.filter((r: any) => r.status === statusFilter)
  }

  // Sort
  recordArray = [...recordArray].sort((a: any, b: any) => {
    if (sortBy === 'record_number') {
      return (a.record_number || '').localeCompare(b.record_number || '')
    }
    if (sortBy === 'created_at') {
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    }
    if (sortBy === 'last_edited_at') {
      const aTime = a.last_edited_at ? new Date(a.last_edited_at).getTime() : new Date(a.created_at).getTime()
      const bTime = b.last_edited_at ? new Date(b.last_edited_at).getTime() : new Date(b.created_at).getTime()
      return bTime - aTime
    }
    return 0
  })

  // Fetch profiles for created_by and last_edited_by
  const userIds = new Set<string>()
  recordArray.forEach((r: any) => {
    if (r.created_by) userIds.add(r.created_by)
    if (r.last_edited_by) userIds.add(r.last_edited_by)
  })
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, display_name')
    .in('id', Array.from(userIds))

  const profileMap = new Map((profiles || []).map((p) => [p.id, p.display_name || 'Unknown']))

  const getStatusBadge = (status: string) => {
    const styles = {
      draft: 'bg-gray-100 text-gray-800',
      submitted: 'bg-yellow-100 text-yellow-800',
      under_review: 'bg-blue-100 text-blue-800',
      approved: 'bg-green-100 text-green-800',
      rejected: 'bg-red-100 text-red-800',
      amended: 'bg-purple-100 text-purple-800',
    }
    return (
      <Badge className={styles[status as keyof typeof styles] || styles.draft}>
        {status.replace('_', ' ')}
      </Badge>
    )
  }

  return (
    <>
      <RecordsListToolbar statusFilter={statusFilter} sortBy={sortBy} />
      {recordArray.length === 0 ? (
        <p className="text-gray-500 py-4">No records match the selected filter.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Record Number</TableHead>
              <TableHead>Version</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Created</TableHead>
              <TableHead>Last edited</TableHead>
              <TableHead>Created by</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {recordArray.map((record: any) => (
              <TableRow key={record.id}>
                <TableCell className="font-medium">{record.record_number}</TableCell>
                <TableCell>
                  <Badge variant="outline">v{record.version}</Badge>
                </TableCell>
                <TableCell>{getStatusBadge(record.status)}</TableCell>
                <TableCell>{new Date(record.created_at).toLocaleDateString()}</TableCell>
                <TableCell>
                  {record.last_edited_at ? (
                    <span className="text-sm">
                      {profileMap.get(record.last_edited_by) ?? '—'} ·{' '}
                      {new Date(record.last_edited_at).toLocaleDateString()}
                    </span>
                  ) : (
                    '—'
                  )}
                </TableCell>
                <TableCell>{profileMap.get(record.created_by) ?? '—'}</TableCell>
                <TableCell className="text-right">
                  <Link href={`/studies/${studyId}/records/${record.id}`}>
                    <Button variant="outline" size="sm">
                      View
                    </Button>
                  </Link>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </>
  )
}
