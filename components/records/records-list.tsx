import { createClient } from '@/lib/supabase/server'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import Link from 'next/link'

interface RecordsListProps {
  studyId: string
}

export default async function RecordsList({ studyId }: RecordsListProps) {
  const supabase = await createClient()
  
  // Fetch latest version of each record
  const { data: records, error } = await supabase
    .from('records')
    .select('*')
    .eq('study_id', studyId)
    .order('record_number', { ascending: true })
    .order('version', { ascending: false })

  if (error) {
    return <div className="text-red-600">Error loading records: {error.message}</div>
  }

  if (!records || records.length === 0) {
    return (
      <div className="py-12 text-center">
        <p className="text-gray-500">No records yet. Create your first record to get started.</p>
      </div>
    )
  }

  // Group by record_number and get latest version
  const latestRecords = records.reduce((acc: any, record: any) => {
    if (!acc[record.record_number] || acc[record.record_number].version < record.version) {
      acc[record.record_number] = record
    }
    return acc
  }, {})

  const recordArray = Object.values(latestRecords)

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
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Record Number</TableHead>
          <TableHead>Version</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Created</TableHead>
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
  )
}
