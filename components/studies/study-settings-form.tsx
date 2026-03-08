'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { updateStudySettings, type StudySettingsInput } from '@/app/studies/[id]/settings/actions'

interface StudySettingsFormProps {
  studyId: string
  initial: StudySettingsInput
}

export default function StudySettingsForm({ studyId, initial }: StudySettingsFormProps) {
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [pending, setPending] = useState(false)
  const [requireReview, setRequireReview] = useState(initial.require_review_before_approval)
  const [allowCreator, setAllowCreator] = useState(initial.allow_creator_approval)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setPending(true)
    const form = e.currentTarget
    const countRaw = (form.elements.namedItem('required_approval_count') as HTMLInputElement)?.value
    const count = Math.max(1, parseInt(countRaw ?? '1', 10) || 1)
    const result = await updateStudySettings(studyId, {
      required_approval_count: count,
      require_review_before_approval: requireReview,
      allow_creator_approval: allowCreator,
    })
    setPending(false)
    if (result?.error) {
      setError(result.error)
      setSuccess(false)
    } else {
      setError(null)
      setSuccess(true)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-2xl space-y-6">
      {error && (
        <div className="rounded-md bg-red-50 p-4">
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}
      {success && (
        <div className="rounded-md border border-green-200 bg-green-50 px-4 py-2 text-sm text-green-800">
          Settings saved.
        </div>
      )}
      <Card>
        <CardHeader>
          <CardTitle>Workflow</CardTitle>
          <CardDescription>
            Control how many approvals are required and who can approve.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="required_approval_count">Required approval count</Label>
            <Input
              id="required_approval_count"
              name="required_approval_count"
              type="number"
              min={1}
              defaultValue={initial.required_approval_count}
              className="mt-1 w-24"
            />
            <p className="mt-1 text-xs text-gray-500">
              Number of distinct approvers who must sign with approval before a record is marked approved. Minimum 1.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="require_review_before_approval"
              checked={requireReview}
              onChange={(e) => setRequireReview(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300"
            />
            <Label htmlFor="require_review_before_approval" className="font-normal">
              Require record to be in review before approval (recommended)
            </Label>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="allow_creator_approval"
              checked={allowCreator}
              onChange={(e) => setAllowCreator(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300"
            />
            <Label htmlFor="allow_creator_approval" className="font-normal">
              Allow study creator to approve records (in addition to approver role)
            </Label>
          </div>
        </CardContent>
      </Card>
      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? 'Saving...' : 'Save settings'}
        </Button>
        <Button type="button" variant="outline" onClick={() => window.history.back()}>
          Cancel
        </Button>
      </div>
    </form>
  )
}
