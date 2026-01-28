import { createClient } from '@/lib/supabase/server'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'

interface StudiesListProps {
  userId: string
}

export default async function StudiesList({ userId }: StudiesListProps) {
  const supabase = await createClient()
  
  // Fetch studies where user is a member
  const { data: studies, error } = await supabase
    .from('studies')
    .select(`
      *,
      study_members!inner(role)
    `)
    .eq('study_members.user_id', userId)
    .is('study_members.revoked_at', null)
    .order('created_at', { ascending: false })

  if (error) {
    return <div className="text-red-600">Error loading studies: {error.message}</div>
  }

  if (!studies || studies.length === 0) {
    return (
      <div className="py-12 text-center">
        <p className="text-gray-500">No studies yet. Create your first study to get started.</p>
      </div>
    )
  }

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

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Title</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Your Role</TableHead>
          <TableHead>Created</TableHead>
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {studies.map((study: any) => (
          <TableRow key={study.id}>
            <TableCell className="font-medium">{study.title}</TableCell>
            <TableCell>{getStatusBadge(study.status)}</TableCell>
            <TableCell>
              <Badge variant="outline">{study.study_members[0]?.role || 'member'}</Badge>
            </TableCell>
            <TableCell>{new Date(study.created_at).toLocaleDateString()}</TableCell>
            <TableCell className="text-right">
              <Link href={`/studies/${study.id}`}>
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
