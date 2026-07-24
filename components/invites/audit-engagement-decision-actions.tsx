'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { AsyncStatusLine } from '@/components/ui/async-status-line'
import { ButtonLoadingLabel } from '@/components/ui/button-loading-label'
import { toast } from '@/lib/toast'
import { notifyInvitesChanged } from '@/lib/invites/notify-invites-changed'
import { AUDITOR_ATTESTATION_STATEMENT } from '@/lib/auditor/auditor-credentials'

type Busy = 'accept' | 'decline' | null

type ReferencePolicy = {
  label: string
  required: boolean
  formatHint: string | null
}

export default function AuditEngagementDecisionActions({
  engagementId,
  referencePolicy,
}: {
  engagementId: string
  referencePolicy: ReferencePolicy
}) {
  const router = useRouter()
  const [busy, setBusy] = useState<Busy>(null)
  const [organizationName, setOrganizationName] = useState('')
  const [title, setTitle] = useState('')
  const [referenceId, setReferenceId] = useState('')
  const [attested, setAttested] = useState(false)
  const disabled = busy !== null

  async function handleAccept() {
    if (!organizationName.trim()) {
      toast.error('Organization required', 'Enter the audit firm or organization you represent.')
      return
    }
    if (referencePolicy.required && !referenceId.trim()) {
      toast.error('Reference required', `Enter your ${referencePolicy.label.toLowerCase()}.`)
      return
    }
    if (!attested) {
      toast.error('Attestation required', 'Confirm the attestation before accepting.')
      return
    }

    setBusy('accept')
    try {
      const res = await fetch(`/api/auditor/engagements/${engagementId}/accept`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          organization_name: organizationName.trim(),
          title: title.trim() || undefined,
          reference_id: referenceId.trim() || undefined,
          attested: true,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (data?.requires_account_setup) {
        toast.error('Setup required', 'Finish account setup before accepting.')
        const path =
          typeof data.setup_path === 'string' ? data.setup_path : '/account/setup?auditor_invite=1'
        router.push(path)
        return
      }
      if (!res.ok) throw new Error(data.error || res.statusText)
      toast.success('Audit engagement accepted')
      notifyInvitesChanged()
      router.push('/auditor')
      router.refresh()
    } catch (e) {
      toast.error('Accept failed', e instanceof Error ? e.message : 'Failed')
    } finally {
      setBusy(null)
    }
  }

  async function handleDecline() {
    setBusy('decline')
    try {
      const res = await fetch(`/api/auditor/engagements/${engagementId}/decline`, {
        method: 'POST',
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || res.statusText)
      toast.success('Audit engagement declined')
      notifyInvitesChanged()
      router.push('/invites')
      router.refresh()
    } catch (e) {
      toast.error('Decline failed', e instanceof Error ? e.message : 'Failed')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="space-y-4">
      <div className="space-y-3 rounded-md border border-border bg-muted/20 p-4">
        <p className="text-sm font-medium text-foreground">Auditor credentials</p>
        <p className="text-xs text-muted-foreground">
          Required before access is granted. These details appear on your engagement banner and
          evidence pack.
        </p>
        <div className="space-y-2">
          <Label htmlFor="auditor-org">Audit organization / firm *</Label>
          <Input
            id="auditor-org"
            value={organizationName}
            onChange={(e) => setOrganizationName(e.target.value)}
            placeholder="e.g. Acme Audit LLP"
            disabled={disabled}
            autoComplete="organization"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="auditor-title">Your title (optional)</Label>
          <Input
            id="auditor-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Senior auditor"
            disabled={disabled}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="auditor-ref">
            {referencePolicy.label}
            {referencePolicy.required ? ' *' : ' (optional)'}
          </Label>
          <Input
            id="auditor-ref"
            value={referenceId}
            onChange={(e) => setReferenceId(e.target.value)}
            placeholder={referencePolicy.formatHint ?? 'e.g. ENG-2026-014'}
            disabled={disabled}
          />
          {referencePolicy.formatHint ? (
            <p className="text-xs text-muted-foreground">
              Required format pattern: <code className="text-xs">{referencePolicy.formatHint}</code>
            </p>
          ) : null}
        </div>
        <label className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={attested}
            onChange={(e) => setAttested(e.target.checked)}
            disabled={disabled}
          />
          <span>{AUDITOR_ATTESTATION_STATEMENT}</span>
        </label>
      </div>

      <AsyncStatusLine
        message={
          busy === 'accept'
            ? 'Accepting audit engagement…'
            : busy === 'decline'
              ? 'Declining…'
              : null
        }
      />
      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={handleAccept} disabled={disabled} aria-busy={busy === 'accept'}>
          <ButtonLoadingLabel loading={busy === 'accept'} loadingLabel="Accepting…">
            Accept engagement
          </ButtonLoadingLabel>
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={handleDecline}
          disabled={disabled}
          aria-busy={busy === 'decline'}
        >
          <ButtonLoadingLabel loading={busy === 'decline'} loadingLabel="Declining…">
            Decline
          </ButtonLoadingLabel>
        </Button>
      </div>
    </div>
  )
}
