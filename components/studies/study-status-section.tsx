'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  updateStudyStatus,
  type StudyLifecycleUpdate,
} from '@/app/studies/[id]/settings/actions'
import { toast } from '@/lib/toast'
import type { StudyStatus } from '@/lib/types'

interface StudyStatusSectionProps {
  studyId: string
  status: StudyStatus
  /** When status is active: whether "Mark completed" is allowed (server mirrors this). */
  canMarkCompleted: boolean
  /** Shown when Mark completed is disabled. */
  completionBlockedReason: string | null
}

export default function StudyStatusSection({
  studyId,
  status,
  canMarkCompleted,
  completionBlockedReason,
}: StudyStatusSectionProps) {
  const [pending, setPending] = useState<StudyLifecycleUpdate | null>(null)

  async function apply(next: StudyLifecycleUpdate) {
    const messages: Record<string, string> = {
      completed: 'Mark this study as completed? It will no longer be editable until set back to active.',
      archived: 'Archive this study? It will no longer be editable until set back to active.',
      active: 'Set this study back to active? You will be able to edit records and settings again.',
    }
    if (!window.confirm(messages[next] ?? 'Change study status?')) {
      return
    }
    setPending(next)
    const result = await updateStudyStatus(studyId, next)
    setPending(null)
    if (result?.error) {
      toast.error('Update failed', result.error)
    } else {
      const success: Record<string, string> = {
        completed: 'Study marked completed',
        archived: 'Study archived',
        active: 'Study set to active',
      }
      toast.success(success[next] ?? 'Status updated')
    }
  }

  if (status === 'active') {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Study status</CardTitle>
          <CardDescription>
            Active studies can be edited. When work is finished, mark the study
            completed or archive it; the study will then be read-only until you
            resume it.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              disabled={pending !== null || !canMarkCompleted}
              title={
                !canMarkCompleted && completionBlockedReason
                  ? completionBlockedReason
                  : undefined
              }
              onClick={() => apply('completed')}
            >
              {pending === 'completed' ? 'Updating…' : 'Mark completed'}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={pending !== null}
              onClick={() => apply('archived')}
            >
              {pending === 'archived' ? 'Updating…' : 'Archive'}
            </Button>
          </div>
          {!canMarkCompleted && completionBlockedReason ? (
            <p className="text-sm text-muted-foreground">{completionBlockedReason}</p>
          ) : null}
        </CardContent>
      </Card>
    )
  }

  const label =
    status === 'completed'
      ? 'Completed'
      : status === 'archived'
        ? 'Archived'
        : status === 'draft'
          ? 'Draft'
          : status

  return (
    <Card>
      <CardHeader>
        <CardTitle>Study status</CardTitle>
        <CardDescription>
          This study is not active; workflow and content cannot be changed until
          you set it back to active.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center gap-3">
        <Badge variant="secondary" className="text-sm capitalize">
          {label}
        </Badge>
        {(status === 'completed' || status === 'archived') && (
          <Button
            type="button"
            variant="default"
            size="sm"
            disabled={pending !== null}
            onClick={() => apply('active')}
          >
            {pending === 'active' ? 'Updating…' : 'Set to active'}
          </Button>
        )}
      </CardContent>
    </Card>
  )
}
