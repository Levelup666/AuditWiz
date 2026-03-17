import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { canManageStudyMembers } from '@/lib/supabase/permissions'
import StudySettingsForm from '@/components/studies/study-settings-form'
import RecordTemplatesEditor from '@/components/studies/record-templates-editor'
import DeleteStudyButton from '@/components/studies/delete-study-button'
import { ChevronLeft } from 'lucide-react'
import type { RecordTemplate } from '@/lib/types'

interface SettingsPageProps {
  params: Promise<{ id: string }>
}

export default async function StudySettingsPage({ params }: SettingsPageProps) {
  const { id: studyId } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return null
  }

  const allowed = await canManageStudyMembers(user.id, studyId)
  if (!allowed) {
    notFound()
  }

  const { data: study, error } = await supabase
    .from('studies')
    .select('id, title, required_approval_count, require_review_before_approval, allow_creator_approval, metadata')
    .eq('id', studyId)
    .single()

  if (error || !study) {
    notFound()
  }

  const metadata = (study.metadata ?? {}) as Record<string, unknown>
  const initial = {
    required_approval_count: study.required_approval_count ?? 1,
    require_review_before_approval: study.require_review_before_approval ?? true,
    allow_creator_approval: study.allow_creator_approval ?? false,
    ai_enabled: metadata.ai_enabled !== false,
  }

  const recordTemplates = (metadata.record_templates ?? []) as RecordTemplate[]

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Link href={`/studies/${studyId}`}>
          <Button variant="ghost" size="icon" aria-label="Back to study">
            <ChevronLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Study settings</h1>
          <p className="mt-1 text-gray-600">
            {study.title} — workflow and security options
          </p>
        </div>
      </div>
      <StudySettingsForm studyId={studyId} initial={initial} />
      <RecordTemplatesEditor studyId={studyId} initialTemplates={recordTemplates} />
      <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-6">
        <h2 className="text-lg font-semibold text-destructive">Danger Zone</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Permanently delete this study. Only allowed when the study has no approved or anchored records.
        </p>
        <div className="mt-4">
          <DeleteStudyButton studyId={studyId} studyTitle={study.title} />
        </div>
      </div>
    </div>
  )
}
