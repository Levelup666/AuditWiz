'use client'

import { useState } from 'react'
import { useFormStatus } from 'react-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { createRecord } from '@/app/studies/[id]/records/actions'

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" disabled={pending}>
      {pending ? 'Creating...' : 'Create Record'}
    </Button>
  )
}

const DEFAULT_CONTENT = `{
  "title": "",
  "summary": "",
  "notes": ""
}`

interface NewRecordFormProps {
  studyId: string
}

export default function NewRecordForm({ studyId }: NewRecordFormProps) {
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(formData: FormData) {
    setError(null)
    const result = await createRecord(studyId, formData)
    if (result?.error) {
      setError(result.error)
    }
  }

  return (
    <form action={handleSubmit} className="space-y-6 max-w-2xl">
      {error && (
        <div className="rounded-md bg-red-50 p-4">
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}
      <div className="space-y-4">
        <div>
          <Label htmlFor="record_number">Record Number *</Label>
          <Input
            id="record_number"
            name="record_number"
            type="text"
            required
            placeholder="e.g. REC-001"
            className="mt-1"
          />
          <p className="mt-1 text-xs text-gray-500">
            Unique identifier for this record within the study.
          </p>
        </div>
        <div>
          <Label htmlFor="content">Content (JSON)</Label>
          <Textarea
            id="content"
            name="content"
            placeholder={DEFAULT_CONTENT}
            defaultValue={DEFAULT_CONTENT}
            className="mt-1 font-mono text-sm"
            rows={12}
          />
          <p className="mt-1 text-xs text-gray-500">
            Structured record data as JSON. Will be hashed for integrity.
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
