import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import NewRecordForm from '@/components/records/new-record-form'

interface NewRecordPageProps {
  params: Promise<{ id: string }>
}

export default async function NewRecordPage({ params }: NewRecordPageProps) {
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Create Record</h1>
        <p className="mt-2 text-gray-600">
          Add a new record to {study.title}. Records are immutable once created; use Amend to create new versions.
        </p>
      </div>
      <NewRecordForm studyId={studyId} />
    </div>
  )
}
