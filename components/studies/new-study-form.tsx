'use client'

import { useFormStatus } from 'react-dom'
import { Button } from '@/components/ui/button'
import { toast } from '@/lib/toast'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { createStudy } from '@/app/studies/actions'

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" disabled={pending}>
      {pending ? 'Creating...' : 'Create Study'}
    </Button>
  )
}

interface NewStudyFormProps {
  institutions: Array<{ id: string; name: string; slug: string }>
  preselectedInstitutionId?: string | null
}

export default function NewStudyForm({
  institutions = [],
  preselectedInstitutionId,
}: NewStudyFormProps) {
  async function handleSubmit(formData: FormData) {
    const result = await createStudy(formData)
    if (result?.error) {
      toast.error('Create study failed', result.error)
    } else {
      toast.success('Study created successfully')
    }
  }

  return (
    <form action={handleSubmit} className="space-y-6 max-w-md">
      <div className="space-y-4">
        {institutions.length > 0 && (
          <div>
            <Label htmlFor="institution_id">Institution *</Label>
            <select
              id="institution_id"
              name="institution_id"
              required
              defaultValue={preselectedInstitutionId ?? ''}
              className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="">Select institution</option>
              {institutions.map((inst) => (
                <option key={inst.id} value={inst.id}>
                  {inst.name}
                </option>
              ))}
            </select>
          </div>
        )}
        <div>
          <Label htmlFor="title">Title *</Label>
          <Input
            id="title"
            name="title"
            type="text"
            required
            placeholder="Study title"
            className="mt-1"
          />
        </div>
        <div>
          <Label htmlFor="description">Description</Label>
          <Textarea
            id="description"
            name="description"
            placeholder="Brief description of the study"
            className="mt-1"
            rows={4}
          />
        </div>
        <div>
          <Label htmlFor="status">Status</Label>
          <select
            id="status"
            name="status"
            className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="draft">Draft</option>
            <option value="active">Active</option>
            <option value="completed">Completed</option>
            <option value="archived">Archived</option>
          </select>
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
