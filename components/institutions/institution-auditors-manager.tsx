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
import { getEngagementStatus } from '@/lib/auditor/engagements'

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
  created_at: string
  studies: ScopedStudy[]
}

interface Props {
  institutionId: string
  studies: StudyOption[]
}

export default function InstitutionAuditorsManager({
  institutionId,
  studies,
}: Props) {
  const [engagements, setEngagements] = useState<EngagementRow[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [actionId, setActionId] = useState<string | null>(null)

  // create form state
  const [email, setEmail] = useState('')
  const [purpose, setPurpose] = useState('')
  const [duration, setDuration] = useState('30')
  const [scope, setScope] = useState<'institution_wide' | 'specific_studies'>(
    'institution_wide'
  )
  const [selectedStudyIds, setSelectedStudyIds] = useState<string[]>([])

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
    if (!email.trim()) {
      toast.error('Email required', 'Enter the auditor email address.')
      return
    }
    if (scope === 'specific_studies' && selectedStudyIds.length === 0) {
      toast.error('Select studies', 'Pick at least one study or switch to institution-wide.')
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch(`/api/institutions/${institutionId}/auditors`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          auditor_email: email.trim(),
          purpose: purpose.trim() || null,
          scope,
          duration_days: Number(duration) || 30,
          study_ids: scope === 'specific_studies' ? selectedStudyIds : [],
        }),
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
      if (!res.ok) {
        throw new Error(data?.error || res.statusText)
      }
      if (data.email_dispatched) {
        toast.success(
          'Engagement created',
          data.email_dispatch_message ||
            'The auditor will receive an email with their invite link.'
        )
      } else {
        toast.warning(
          'Engagement created',
          data.email_dispatch_message ||
            'No email was sent (mail not configured). Share the invite link from logs / records.'
        )
      }
      setEmail('')
      setPurpose('')
      setDuration('30')
      setScope('institution_wide')
      setSelectedStudyIds([])
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
            They cannot edit, sign, approve, or anchor anything.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="auditor-email">Auditor email *</Label>
                <Input
                  id="auditor-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="auditor@example.com"
                  className="mt-1"
                />
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
                      {row.purpose ? row.purpose : '—'}
                    </TableCell>
                    <TableCell className="space-x-1 text-right">
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
