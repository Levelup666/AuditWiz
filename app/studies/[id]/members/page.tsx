import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { canManageStudyMembers } from '@/lib/supabase/permissions'
import StudyMembersManager from '@/components/studies/study-members-manager'

interface MembersPageProps {
  params: Promise<{ id: string }>
}

export default async function StudyMembersPage({ params }: MembersPageProps) {
  const { id: studyId } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return null
  }

  const { data: study, error } = await supabase
    .from('studies')
    .select('id, title')
    .eq('id', studyId)
    .single()

  if (error || !study) {
    notFound()
  }

  const canManage = await canManageStudyMembers(user.id, studyId)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Study Members</h1>
          <p className="mt-2 text-gray-600">
            {study.title} – manage who has access and their roles.
          </p>
        </div>
        <Link href={`/studies/${studyId}`}>
          <Button variant="outline">Back to Study</Button>
        </Link>
      </div>

      {canManage ? (
        <StudyMembersManager studyId={studyId} />
      ) : (
        <p className="text-gray-500">You do not have permission to manage members.</p>
      )}
    </div>
  )
}
