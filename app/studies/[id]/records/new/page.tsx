import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import NewRecordForm from '@/components/records/new-record-form'
import { canManageStudyMembers } from '@/lib/supabase/permissions'
import type { RecordTemplate } from '@/lib/types'

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
    .select('id, title, metadata, institution_id')
    .eq('id', studyId)
    .single()

  if (error || !study) {
    notFound()
  }

  let primaryResearchField: string | null = null
  if (study.institution_id) {
    const { data: inst } = await supabase
      .from('institutions')
      .select('metadata')
      .eq('id', study.institution_id)
      .single()
    const rf = (inst?.metadata as { research_field?: string } | null)?.research_field
    primaryResearchField = typeof rf === 'string' ? rf : null
  }

  const canSaveStudyTemplate = await canManageStudyMembers(user.id, studyId)

  const metadata = (study.metadata ?? {}) as Record<string, unknown>
  const recordTemplates = (metadata.record_templates ?? []) as RecordTemplate[]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Create Record</h1>
        <p className="mt-2 text-gray-600">
          Add a new record to {study.title}. Records are immutable once created; use Amend to create new versions.
        </p>
      </div>
      <NewRecordForm
        studyId={studyId}
        templates={recordTemplates}
        primaryResearchField={primaryResearchField}
        canSaveStudyTemplate={canSaveStudyTemplate}
      />
    </div>
  )
}
