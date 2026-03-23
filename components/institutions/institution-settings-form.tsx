'use client'

import { useFormStatus } from 'react-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { toast } from '@/lib/toast'
import { updateInstitution } from '@/app/institutions/[id]/settings/actions'
import { INSTITUTION_RESEARCH_TYPES } from '@/lib/institution-research-types'

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" disabled={pending}>
      {pending ? 'Saving…' : 'Save'}
    </Button>
  )
}

interface InstitutionSettingsFormProps {
  institutionId: string
  initialData: {
    name: string
    description: string
    domain: string
    researchField: string
    allowExternalCollaborators: boolean
  }
}

export default function InstitutionSettingsForm({
  institutionId,
  initialData,
}: InstitutionSettingsFormProps) {
  async function handleSubmit(formData: FormData) {
    const result = await updateInstitution(institutionId, formData)
    if (result?.error) {
      toast.error('Update failed', result.error)
    } else {
      toast.success('Settings saved')
    }
  }

  return (
    <form action={handleSubmit} className="space-y-6 max-w-xl">
      <div className="space-y-4">
        <div>
          <Label htmlFor="research_field">Primary research field *</Label>
          <select
            id="research_field"
            name="research_field"
            required
            defaultValue={initialData.researchField || ''}
            className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="" disabled>
              Select a research area
            </option>
            {INSTITUTION_RESEARCH_TYPES.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-muted-foreground">
            Main domain for this institution. Choose &quot;Other / general research&quot; if needed.
          </p>
        </div>
        <div>
          <Label htmlFor="name">Name *</Label>
          <Input
            id="name"
            name="name"
            type="text"
            required
            defaultValue={initialData.name}
            placeholder="Institution name"
            className="mt-1"
          />
        </div>
        <div>
          <Label htmlFor="description">Description</Label>
          <Textarea
            id="description"
            name="description"
            defaultValue={initialData.description}
            placeholder="Brief description"
            className="mt-1"
            rows={4}
          />
        </div>
        <div>
          <Label htmlFor="domain">Domain (optional)</Label>
          <Input
            id="domain"
            name="domain"
            type="text"
            defaultValue={initialData.domain}
            placeholder="university.edu"
            className="mt-1"
          />
          <p className="text-xs text-muted-foreground mt-1">
            For future email-domain validation
          </p>
        </div>
        <div>
          <Label htmlFor="allow_external_collaborators">Study collaborators *</Label>
          <select
            id="allow_external_collaborators"
            name="allow_external_collaborators"
            required
            defaultValue={initialData.allowExternalCollaborators ? 'true' : 'false'}
            className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="true">
              Allow external collaborators (study-only access without institution membership)
            </option>
            <option value="false">
              Institution members only (block external collaborators; stricter)
            </option>
          </select>
          <p className="mt-1 text-xs text-muted-foreground">
            If you switch to institution members only, you cannot save while any study in this
            institution still has participants who are not institution members—invite them to the
            institution or remove them from studies first.
          </p>
        </div>
      </div>
      <div className="flex gap-2">
        <SubmitButton />
        <Button type="button" variant="outline" onClick={() => window.history.back()}>
          Cancel
        </Button>
      </div>
    </form>
  )
}
