'use client'

import { useState } from 'react'
import { useFormStatus } from 'react-dom'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { updateStudyDocumentation } from '@/app/studies/[id]/documentation/actions'
import { Pencil, Save } from 'lucide-react'

function SaveButton() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" disabled={pending} size="sm">
      <Save className="mr-2 h-4 w-4" />
      {pending ? 'Saving...' : 'Save'}
    </Button>
  )
}

interface StudyDocumentationCardProps {
  studyId: string
  documentation: string | null
  canEdit: boolean
}

export default function StudyDocumentationCard({
  studyId,
  documentation,
  canEdit,
}: StudyDocumentationCardProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [value, setValue] = useState(documentation ?? '')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setSuccess(false)
    const result = await updateStudyDocumentation(studyId, value)
    if (result?.error) {
      setError(result.error)
    } else {
      setSuccess(true)
      setIsEditing(false)
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <div>
          <CardTitle>Study Documentation</CardTitle>
          <CardDescription>
            Protocol overview, SOPs, or study-specific instructions. Markdown supported.
          </CardDescription>
        </div>
        {canEdit && !isEditing && (
          <Button variant="outline" size="sm" onClick={() => setIsEditing(true)}>
            <Pencil className="mr-2 h-4 w-4" />
            Edit
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {error && (
          <div className="rounded-md bg-red-50 p-3 mb-4">
            <p className="text-sm text-red-800">{error}</p>
          </div>
        )}
        {success && (
          <div className="rounded-md bg-green-50 p-3 mb-4 text-sm text-green-800">
            Documentation saved.
          </div>
        )}
        {isEditing && canEdit ? (
          <form onSubmit={handleSubmit} className="space-y-4">
            <Textarea
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="Enter study documentation (protocol, SOPs, instructions)..."
              className="min-h-[200px] font-mono text-sm"
              rows={12}
            />
            <div className="flex gap-2">
              <SaveButton />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setIsEditing(false)
                  setValue(documentation ?? '')
                }}
              >
                Cancel
              </Button>
            </div>
          </form>
        ) : documentation ? (
          <pre className="whitespace-pre-wrap text-sm bg-gray-50 p-4 rounded font-sans">
            {documentation}
          </pre>
        ) : (
          <p className="text-sm text-gray-500 italic">
            No documentation yet. {canEdit && 'Click Edit to add protocol overview, SOPs, or instructions.'}
          </p>
        )}
      </CardContent>
    </Card>
  )
}
