'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { updateStudySettings, type StudySettingsInput } from '@/app/studies/[id]/settings/actions'
import { toast } from '@/lib/toast'

interface StudySettingsFormProps {
  studyId: string
  initial: StudySettingsInput
  studyIsActive: boolean
  distinctMemberCount: number
  platformDefaultCap: number
  absoluteMaxMembers: number
  effectiveMemberCap: number
}

export default function StudySettingsForm({
  studyId,
  initial,
  studyIsActive,
  distinctMemberCount,
  platformDefaultCap,
  absoluteMaxMembers,
  effectiveMemberCap,
}: StudySettingsFormProps) {
  const [pending, setPending] = useState(false)
  const [requireReview, setRequireReview] = useState(initial.require_review_before_approval)
  const [allowCreator, setAllowCreator] = useState(initial.allow_creator_approval)
  const [aiEnabled, setAiEnabled] = useState(initial.ai_enabled ?? true)
  const [maxMembersStr, setMaxMembersStr] = useState(
    initial.max_members == null ? '' : String(initial.max_members)
  )

  useEffect(() => {
    setMaxMembersStr(initial.max_members == null ? '' : String(initial.max_members))
  }, [studyId, initial.max_members])

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setPending(true)
    const form = e.currentTarget
    const countRaw = (form.elements.namedItem('required_approval_count') as HTMLInputElement)?.value
    const count = Math.max(1, parseInt(countRaw ?? '1', 10) || 1)

    const trimmed = maxMembersStr.trim()
    let max_members: number | null
    if (trimmed === '') {
      max_members = null
    } else {
      const n = Math.floor(Number.parseInt(trimmed, 10))
      if (!Number.isFinite(n) || n < 1) {
        setPending(false)
        toast.error('Invalid member cap', 'Enter a positive integer or leave empty for the platform default.')
        return
      }
      if (n > absoluteMaxMembers) {
        setPending(false)
        toast.error('Member cap too high', `Maximum allowed is ${absoluteMaxMembers}.`)
        return
      }
      if (n < distinctMemberCount) {
        setPending(false)
        toast.error(
          'Member cap too low',
          `There are already ${distinctMemberCount} people on this study.`
        )
        return
      }
      max_members = n
    }

    const result = await updateStudySettings(studyId, {
      required_approval_count: count,
      require_review_before_approval: requireReview,
      allow_creator_approval: allowCreator,
      ai_enabled: aiEnabled,
      max_members,
    })
    setPending(false)
    if (result?.error) {
      toast.error('Save failed', result.error)
    } else {
      toast.success('Settings saved')
    }
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-2xl space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Workflow</CardTitle>
          <CardDescription>
            Control how many approvals are required and who can approve.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!studyIsActive && (
            <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              Workflow settings are read-only because this study is not active.
            </p>
          )}
          <div>
            <Label htmlFor="required_approval_count">Required approval count</Label>
            <Input
              id="required_approval_count"
              name="required_approval_count"
              type="number"
              min={1}
              defaultValue={initial.required_approval_count}
              className="mt-1 w-24"
              disabled={!studyIsActive}
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
              disabled={!studyIsActive}
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
              disabled={!studyIsActive}
              className="h-4 w-4 rounded border-gray-300"
            />
            <Label htmlFor="allow_creator_approval" className="font-normal">
              Allow study creator to approve records (in addition to approver role)
            </Label>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="ai_enabled"
              checked={aiEnabled}
              onChange={(e) => setAiEnabled(e.target.checked)}
              disabled={!studyIsActive}
              className="h-4 w-4 rounded border-gray-300"
            />
            <Label htmlFor="ai_enabled" className="font-normal">
              Enable AI features (summarization, analysis)
            </Label>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Members</CardTitle>
          <CardDescription>
            Limit how many distinct people can participate (counts once per person, even with two roles).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!studyIsActive && (
            <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              Member cap is read-only because this study is not active.
            </p>
          )}
          <div>
            <Label htmlFor="max_members">Max distinct members</Label>
            <Input
              id="max_members"
              name="max_members"
              type="number"
              min={1}
              max={absoluteMaxMembers}
              value={maxMembersStr}
              onChange={(e) => setMaxMembersStr(e.target.value)}
              placeholder={`Platform default (${platformDefaultCap})`}
              className="mt-1 max-w-xs"
              disabled={!studyIsActive}
            />
            <p className="mt-1 text-xs text-gray-500">
              Leave empty to use the platform default ({platformDefaultCap}). Current effective cap:{' '}
              {effectiveMemberCap}. People on this study now: {distinctMemberCount}. Hard ceiling:{' '}
              {absoluteMaxMembers}.
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="flex gap-2">
        <Button type="submit" disabled={pending || !studyIsActive}>
          {pending ? 'Saving...' : 'Save settings'}
        </Button>
        <Button type="button" variant="outline" onClick={() => window.history.back()}>
          Cancel
        </Button>
      </div>
    </form>
  )
}
