'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Loader2 } from 'lucide-react'
import { toast } from '@/lib/toast'
import { getEngagementStatus } from '@/lib/auditor/engagement-status'

type StudyOption = { id: string; title: string }

type ScopedStudy = { study_id: string; title: string | null }

type EngagementRow = {
  id: string
  auditor_email: string
  auditor_user_id: string | null
  auditor_user_email: string | null
  scope: 'institution_wide' | 'specific_studies'
  purpose: string | null
  starts_at: string
  expires_at: string
  accepted_at: string | null
  revoked_at: string | null
  revocation_reason: string | null
  granted_by: string
  last_sent_at: string
  resend_count: number
  invite_first_opened_at: string | null
  batch_id: string | null
  created_at: string
  engagement_letter_file_name: string | null
  engagement_letter_file_hash: string | null
  engagement_letter_uploaded_at: string | null
  coi_has_conflict: boolean | null
  coi_declared_at: string | null
  studies: ScopedStudy[]
}

interface Props {
  institutionId: string
  studies: StudyOption[]
  auditorInvitesRequireFreshEmail?: boolean
}

export default function InstitutionAuditorsManager({
  institutionId,
  studies,
  auditorInvitesRequireFreshEmail = false,
}: Props) {
  const [engagements, setEngagements] = useState<EngagementRow[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [actionId, setActionId] = useState<string | null>(null)

  // create form state
  const [emailsText, setEmailsText] = useState('')
  const [purpose, setPurpose] = useState('')
  const [duration, setDuration] = useState('30')
  const [scope, setScope] = useState<'institution_wide' | 'specific_studies'>(
    'institution_wide'
  )
  const [selectedStudyIds, setSelectedStudyIds] = useState<string[]>([])
  const [overrideStudyMemberConflict, setOverrideStudyMemberConflict] = useState(false)
  const [overrideReason, setOverrideReason] = useState('')
  const [letterFile, setLetterFile] = useState<File | null>(null)

  const fetchList = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/institutions/${institutionId}/auditors`)
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || res.statusText)
      setEngagements(Array.isArray(data.engagements) ? data.engagements : [])
    } catch (e) {
      toast.error('Load failed', e instanceof Error ? e.message : 'Could not load engagements')
    } finally {
      setLoading(false)
    }
  }, [institutionId])

  useEffect(() => {
    void fetchList()
  }, [fetchList])

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault()
    const auditorEmails = emailsText
      .split(/[\n,;]+/)
      .map((e) => e.trim())
      .filter(Boolean)
    if (auditorEmails.length === 0) {
      toast.error('Email required', 'Enter at least one auditor email address.')
      return
    }
    if (!letterFile) {
      toast.error('Letter required', 'Upload the engagement letter / scope PDF before issuing.')
      return
    }
    if (scope === 'specific_studies' && selectedStudyIds.length === 0) {
      toast.error('Select studies', 'Pick at least one study or switch to institution-wide.')
      return
    }
    if (overrideStudyMemberConflict && !overrideReason.trim()) {
      toast.error(
        'Override reason required',
        'Document why a study collaborator may receive an auditor engagement.'
      )
      return
    }
    setSubmitting(true)
    try {
      const form = new FormData()
      form.append('auditor_emails', auditorEmails.join('\n'))
      form.append('purpose', purpose.trim())
      form.append('scope', scope)
      form.append('duration_days', String(Number(duration) || 30))
      form.append('study_ids', JSON.stringify(scope === 'specific_studies' ? selectedStudyIds : []))
      form.append(
        'override_study_member_conflict',
        overrideStudyMemberConflict ? 'true' : 'false'
      )
      if (overrideReason.trim()) form.append('override_reason', overrideReason.trim())
      form.append('file', letterFile)

      const res = await fetch(`/api/institutions/${institutionId}/auditors`, {
        method: 'POST',
        body: form,
      })
      const data = await res.json().catch(() => ({}))
      if (res.status === 409 && data.code === 'duplicate_engagement') {
        toast.warning(
          'Already invited',
          'An engagement for that email already exists. Revoke it first or use Resend.'
        )
        await fetchList()
        return
      }
      if (res.status === 409 && data.code === 'study_member_conflict') {
        toast.warning(
          'Study collaborator conflict',
          data.error ||
            'This email is already on a study in scope. Enable override with a documented reason, or use a dedicated auditor email.'
        )
        return
      }
      if (res.status === 403 && data.code === 'institution_member_conflict') {
        toast.error(
          'Institution member',
          data.error ||
            'Active institution members cannot be invited as external auditors.'
        )
        return
      }
      if (res.status === 403 && data.code === 'existing_account_not_allowed') {
        toast.error(
          'Existing account',
          data.error ||
            'This institution requires auditor emails with no existing AuditWiz account.'
        )
        return
      }
      if (res.status === 400 && data.code === 'letter_required') {
        toast.error('Letter required', data.error || 'Upload a PDF engagement letter.')
        return
      }
      if (!res.ok) {
        throw new Error(data?.error || res.statusText)
      }
      const created = Array.isArray(data.created) ? data.created : []
      const createdCount = created.length || 1
      const skippedCount = Array.isArray(data.skipped) ? data.skipped.length : 0

      if (data.email_dispatched) {
        toast.success(
          createdCount > 1 ? 'Engagements created' : 'Engagement created',
          data.email_dispatch_message ||
            `Invitation email sent to ${createdCount} auditor${createdCount === 1 ? '' : 's'}.`
        )
      } else {
        toast.warning(
          createdCount > 1 ? 'Engagements created' : 'Engagement created',
          data.email_dispatch_message ||
            'No email was sent (mail not configured). Share invite links from your records if needed.'
        )
      }
      if (skippedCount > 0) {
        toast.warning(
          'Some skipped',
          `${skippedCount} address${skippedCount === 1 ? '' : 'es'} could not be invited.`
        )
      }
      setEmailsText('')
      setPurpose('')
      setDuration('30')
      setScope('institution_wide')
      setSelectedStudyIds([])
      setOverrideStudyMemberConflict(false)
      setOverrideReason('')
      setLetterFile(null)
      await fetchList()
    } catch (e) {
      toast.error('Create failed', e instanceof Error ? e.message : 'Could not create engagement')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleRevoke(row: EngagementRow) {
    const reason = window.prompt(
      `Revoke audit engagement for ${row.auditor_email}? Optional reason:`,
      ''
    )
    if (reason === null) return
    setActionId(row.id)
    try {
      const res = await fetch(
        `/api/institutions/${institutionId}/auditors/${row.id}/revoke`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reason }),
        }
      )
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || res.statusText)
      toast.success('Engagement revoked')
      await fetchList()
    } catch (e) {
      toast.error('Revoke failed', e instanceof Error ? e.message : 'Could not revoke')
    } finally {
      setActionId(null)
    }
  }

  async function handleResend(row: EngagementRow) {
    setActionId(row.id)
    try {
      const res = await fetch(
        `/api/institutions/${institutionId}/auditors/${row.id}/resend`,
        { method: 'POST' }
      )
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || res.statusText)
      if (data.email_dispatched) {
        toast.success('Invite resent')
      } else {
        toast.warning('Token rotated', data.email_dispatch_message || 'Invite link rotated; email not delivered.')
      }
      await fetchList()
    } catch (e) {
      toast.error('Resend failed', e instanceof Error ? e.message : 'Could not resend')
    } finally {
      setActionId(null)
    }
  }

  async function handleExtend(row: EngagementRow) {
    const raw = window.prompt('Extend expiration by how many days?', '30')
    if (raw === null) return
    const days = Number(raw)
    if (!Number.isFinite(days) || days <= 0) {
      toast.error('Invalid value', 'Enter a positive number of days.')
      return
    }
    setActionId(row.id)
    try {
      const res = await fetch(
        `/api/institutions/${institutionId}/auditors/${row.id}/extend`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ additional_days: days }),
        }
      )
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || res.statusText)
      toast.success(
        'Extended',
        `New expiry: ${new Date(data.expires_at).toLocaleString()}`
      )
      await fetchList()
    } catch (e) {
      toast.error('Extend failed', e instanceof Error ? e.message : 'Could not extend')
    } finally {
      setActionId(null)
    }
  }

  async function handleAttachLetter(row: EngagementRow, file: File) {
    setActionId(row.id)
    try {
      const form = new FormData()
      form.append('file', file)
      const res = await fetch(
        `/api/institutions/${institutionId}/auditors/${row.id}/letter`,
        { method: 'POST', body: form }
      )
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || res.statusText)
      toast.success('Letter attached', `SHA-256 ${String(data.file_hash).slice(0, 12)}…`)
      await fetchList()
    } catch (e) {
      toast.error('Letter upload failed', e instanceof Error ? e.message : 'Could not upload')
    } finally {
      setActionId(null)
    }
  }

  const sorted = useMemo(() => {
    return [...engagements].sort((a, b) => {
      const sa = getEngagementStatus(a)
      const sb = getEngagementStatus(b)
      const order = { active: 0, pending: 1, expired: 2, revoked: 3 } as const
      if (order[sa] !== order[sb]) return order[sa] - order[sb]
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    })
  }, [engagements])

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Issue audit engagement</CardTitle>
          <CardDescription>
            External or internal auditors get <strong>read-only</strong> access for the window
            you choose. They can read records, signatures, anchors, and audit logs in scope.
            They cannot edit, sign, approve, or anchor anything. Issuing auditor access does not
            require external collaborators or institution membership—auditors are granted via
            audit engagements, not study membership.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Label htmlFor="auditor-emails">Auditor email(s) *</Label>
                <textarea
                  id="auditor-emails"
                  value={emailsText}
                  onChange={(e) => setEmailsText(e.target.value)}
                  placeholder={'auditor@example.com\nreviewer@firm.com'}
                  rows={3}
                  className="mt-1 flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  One email per line, or separate with commas. Each auditor receives their own
                  read-only engagement invite.
                </p>
              </div>
              <div>
                <Label htmlFor="auditor-duration">Duration (days)</Label>
                <Input
                  id="auditor-duration"
                  type="number"
                  min={1}
                  max={365}
                  value={duration}
                  onChange={(e) => setDuration(e.target.value)}
                  className="mt-1"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="auditor-purpose">Purpose / engagement reference</Label>
              <Input
                id="auditor-purpose"
                value={purpose}
                onChange={(e) => setPurpose(e.target.value)}
                placeholder="e.g. State board audit 2026 Q2"
                className="mt-1"
              />
            </div>

            <div>
              <Label htmlFor="auditor-letter">Engagement letter / scope PDF *</Label>
              <Input
                id="auditor-letter"
                type="file"
                accept=".pdf,application/pdf"
                className="mt-1"
                required
                onChange={(e) => setLetterFile(e.target.files?.[0] ?? null)}
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Required. PDF only. Content hash is stored and linked in the audit ledger. Letters
                cannot be replaced after upload.
              </p>
            </div>

            <div className="space-y-2">
              <Label>Scope</Label>
              <div className="flex flex-wrap gap-3 text-sm">
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="auditor-scope"
                    checked={scope === 'institution_wide'}
                    onChange={() => setScope('institution_wide')}
                  />
                  <span>Institution-wide (every study)</span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="auditor-scope"
                    checked={scope === 'specific_studies'}
                    onChange={() => setScope('specific_studies')}
                  />
                  <span>Specific studies</span>
                </label>
              </div>
              {scope === 'specific_studies' && (
                <div className="rounded-md border p-3 text-sm">
                  {studies.length === 0 ? (
                    <p className="text-muted-foreground">No studies under this institution yet.</p>
                  ) : (
                    <div className="grid gap-1 sm:grid-cols-2">
                      {studies.map((s) => {
                        const checked = selectedStudyIds.includes(s.id)
                        return (
                          <label key={s.id} className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={(e) => {
                                setSelectedStudyIds((prev) =>
                                  e.target.checked
                                    ? [...prev, s.id]
                                    : prev.filter((id) => id !== s.id)
                                )
                              }}
                            />
                            <span className="truncate">{s.title}</span>
                          </label>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="rounded-md border border-border bg-muted/30 p-4 space-y-3 text-sm">
              <p className="font-medium text-foreground">Eligibility</p>
              <ul className="list-disc space-y-1 pl-5 text-muted-foreground text-xs">
                <li>
                  Active <strong>institution members</strong> of this organization cannot be
                  invited as external auditors.
                </li>
                <li>
                  Emails that are <strong>study collaborators</strong> on in-scope studies are
                  blocked unless you override with a documented reason below.
                </li>
                {auditorInvitesRequireFreshEmail ? (
                  <li>
                    This institution requires auditor emails with <strong>no existing AuditWiz
                    account</strong>.
                  </li>
                ) : (
                  <li>
                    External auditors may use an existing AuditWiz account (for example at another
                    institution).
                  </li>
                )}
              </ul>
              <label className="flex items-start gap-2">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={overrideStudyMemberConflict}
                  onChange={(e) => setOverrideStudyMemberConflict(e.target.checked)}
                />
                <span>
                  Override study collaborator conflict (requires documented reason for the audit
                  ledger)
                </span>
              </label>
              {overrideStudyMemberConflict ? (
                <div>
                  <Label htmlFor="auditor-override-reason">Override reason *</Label>
                  <Textarea
                    id="auditor-override-reason"
                    value={overrideReason}
                    onChange={(e) => setOverrideReason(e.target.value)}
                    placeholder="e.g. Internal QA review — segregated auditor login confirmed with compliance"
                    rows={2}
                    className="mt-1"
                  />
                </div>
              ) : null}
            </div>

            <div className="flex justify-end">
              <Button type="submit" disabled={submitting}>
                {submitting ? 'Issuing…' : 'Issue engagement'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <div>
        <h2 className="text-lg font-semibold mb-2">Engagements</h2>
        {loading ? (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading engagements…
          </div>
        ) : sorted.length === 0 ? (
          <p className="text-sm text-muted-foreground">No engagements have been issued yet.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Auditor</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Scope</TableHead>
                <TableHead>Window</TableHead>
                <TableHead>Purpose</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.map((row) => {
                const status = getEngagementStatus(row)
                const statusLabel: Record<typeof status, string> = {
                  active: 'Active',
                  pending: 'Pending invite',
                  expired: 'Expired',
                  revoked: 'Revoked',
                }
                const statusClass: Record<typeof status, string> = {
                  active: 'bg-green-100 text-green-800',
                  pending: 'bg-amber-100 text-amber-800',
                  expired: 'bg-gray-100 text-gray-700',
                  revoked: 'bg-red-100 text-red-800',
                }
                const startedLabel = new Date(row.starts_at).toLocaleString()
                const expiresLabel = new Date(row.expires_at).toLocaleString()
                const isPending = status === 'pending'
                return (
                  <TableRow key={row.id}>
                    <TableCell>
                      <div className="font-medium">{row.auditor_email}</div>
                      {row.auditor_user_email && row.auditor_user_email !== row.auditor_email && (
                        <div className="text-xs text-muted-foreground">
                          Signed in as {row.auditor_user_email}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge className={statusClass[status]}>{statusLabel[status]}</Badge>
                      {row.resend_count > 0 && status === 'pending' && (
                        <span className="ml-2 text-xs text-muted-foreground">
                          Resent {row.resend_count}×
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      {row.scope === 'institution_wide' ? (
                        <span className="text-sm">Institution-wide</span>
                      ) : (
                        <span className="text-sm">
                          {row.studies.length} stud
                          {row.studies.length === 1 ? 'y' : 'ies'}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {startedLabel} → {expiresLabel}
                    </TableCell>
                    <TableCell className="text-sm">
                      <div>{row.purpose ? row.purpose : '—'}</div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {row.engagement_letter_file_hash ? (
                          <a
                            className="text-primary hover:underline"
                            href={`/api/institutions/${institutionId}/auditors/${row.id}/letter`}
                          >
                            Letter PDF
                          </a>
                        ) : (
                          <span>No letter</span>
                        )}
                        {row.coi_declared_at ? (
                          <>
                            {' · '}
                            COI
                            {row.coi_has_conflict ? ' (conflict disclosed)' : ' clear'}
                          </>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell className="space-x-1 text-right">
                      {!row.engagement_letter_file_hash &&
                        (status === 'active' || status === 'pending') && (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={actionId === row.id}
                            type="button"
                            onClick={() => {
                              const input = document.createElement('input')
                              input.type = 'file'
                              input.accept = '.pdf,application/pdf'
                              input.onchange = () => {
                                const file = input.files?.[0]
                                if (file) void handleAttachLetter(row, file)
                              }
                              input.click()
                            }}
                          >
                            {actionId === row.id ? '…' : 'Attach letter'}
                          </Button>
                        )}
                      {isPending && (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={actionId === row.id}
                          onClick={() => handleResend(row)}
                        >
                          {actionId === row.id ? '…' : 'Resend'}
                        </Button>
                      )}
                      {(status === 'active' || status === 'pending') && (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={actionId === row.id}
                          onClick={() => handleExtend(row)}
                        >
                          Extend
                        </Button>
                      )}
                      {(status === 'active' || status === 'pending') && (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={actionId === row.id}
                          onClick={() => handleRevoke(row)}
                        >
                          {actionId === row.id ? 'Revoking…' : 'Revoke'}
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        )}
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Auditor capabilities</CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea
            readOnly
            value={`• Read records, signatures, anchors, and audit logs covered by the engagement.
• Download an evidence pack manifest (hash-stamped) once per session.
• Cannot edit, sign, approve, anchor, or change institution / study membership.
• All access (page views, exports) is recorded in the immutable audit ledger.
• You can revoke or extend an engagement at any time; revocation takes effect on the auditor's next request.`}
            className="min-h-[120px] text-xs"
          />
        </CardContent>
      </Card>
    </div>
  )
}
