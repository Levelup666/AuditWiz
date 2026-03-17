'use client'

import { useFormStatus } from 'react-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { toast } from '@/lib/toast'
import { updateInstitution } from '@/app/institutions/[id]/settings/actions'

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
    <form action={handleSubmit} className="space-y-6 max-w-md">
      <div className="space-y-4">
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
