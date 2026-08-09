'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { AsyncStatusLine } from '@/components/ui/async-status-line'
import { ButtonLoadingLabel } from '@/components/ui/button-loading-label'
import { toast } from '@/lib/toast'
import { notifyInvitesChanged } from '@/lib/invites/notify-invites-changed'
import { AUDITOR_ATTESTATION_STATEMENT } from '@/lib/auditor/auditor-credentials'
import { AUDITOR_COI_STATEMENT } from '@/lib/auditor/auditor-coi'

type Busy = 'accept' | 'decline' | null

type ReferencePolicy = {
  label: string
  required: boolean
  formatHint: string | null
}

type EngagementLetterInfo = {
  fileName: string
  fileHash: string
  uploadedAt: string | null
}

export default function AuditEngagementDecisionActions({
  engagementId,
  institutionId,
  referencePolicy,
  engagementLetter,
}: {
  engagementId: string
  institutionId: string
  referencePolicy: ReferencePolicy
  engagementLetter: EngagementLetterInfo | null
}) {
  const router = useRouter()
  const [busy, setBusy] = useState<Busy>(null)
  const [organizationName, setOrganizationName] = useState('')
  const [title, setTitle] = useState('')
  const [referenceId, setReferenceId] = useState('')
  const [attested, setAttested] = useState(false)
  const [coiDeclared, setCoiDeclared] = useState(false)
  const [coiHasConflict, setCoiHasConflict] = useState(false)
  const [coiDisclosure, setCoiDisclosure] = useState('')
  const [letterAcknowledged, setLetterAcknowledged] = useState(false)
  const disabled = busy !== null
  const letterRequired = Boolean(engagementLetter)

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
    if (!coiDeclared) {
      toast.error(
        'COI declaration required',
        'Confirm the conflict-of-interest declaration before accepting.'
      )
      return
    }
    if (coiHasConflict && coiDisclosure.trim().length < 8) {
      toast.error('Disclosure required', 'Briefly describe the potential conflict.')
      return
    }
    if (letterRequired && !letterAcknowledged) {
      toast.error(
        'Letter acknowledgment required',
        'Confirm you have reviewed the engagement letter before accepting.'
      )
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
          coi_declared: true,
          coi_has_conflict: coiHasConflict,
          coi_disclosure: coiHasConflict ? coiDisclosure.trim() : undefined,
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
      router.push(`/auditor/engagements/${engagementId}`)
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
      <ol className="list-decimal space-y-1 pl-5 text-xs text-muted-foreground">
        <li>Confirm your audit organization credentials</li>
        <li>Complete the conflict-of-interest declaration</li>
        {letterRequired ? <li>Acknowledge the engagement letter</li> : null}
        <li>Accept to receive read-only access</li>
      </ol>

      <div className="space-y-3 rounded-md border border-border bg-muted/20 p-4">
        <p className="text-sm font-medium text-foreground">1. Auditor credentials</p>
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

      <div className="space-y-3 rounded-md border border-border bg-muted/20 p-4">
        <p className="text-sm font-medium text-foreground">2. Conflict of interest</p>
        <label className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={coiDeclared}
            onChange={(e) => setCoiDeclared(e.target.checked)}
            disabled={disabled}
          />
          <span>{AUDITOR_COI_STATEMENT}</span>
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={coiHasConflict}
            onChange={(e) => {
              setCoiHasConflict(e.target.checked)
              if (!e.target.checked) setCoiDisclosure('')
            }}
            disabled={disabled}
          />
          <span>I have a potential conflict to disclose</span>
        </label>
        {coiHasConflict ? (
          <div className="space-y-2">
            <Label htmlFor="coi-disclosure">Conflict disclosure *</Label>
            <Textarea
              id="coi-disclosure"
              value={coiDisclosure}
              onChange={(e) => setCoiDisclosure(e.target.value)}
              placeholder="Describe the relationship or interest relevant to this engagement."
              disabled={disabled}
              rows={3}
            />
          </div>
        ) : null}
      </div>

      {engagementLetter ? (
        <div className="space-y-3 rounded-md border border-border bg-muted/20 p-4">
          <p className="text-sm font-medium text-foreground">3. Engagement letter</p>
          <p className="text-xs text-muted-foreground">
            Review the scope letter issued by the institution before accepting.
          </p>
          <div className="text-sm">
            <a
              className="text-primary hover:underline"
              href={`/api/institutions/${institutionId}/auditors/${engagementId}/letter`}
            >
              {engagementLetter.fileName}
            </a>
            <div className="mt-1 font-mono text-xs text-muted-foreground">
              SHA-256 {engagementLetter.fileHash.slice(0, 16)}…
            </div>
          </div>
          <label className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={letterAcknowledged}
              onChange={(e) => setLetterAcknowledged(e.target.checked)}
              disabled={disabled}
            />
            <span>
              I have reviewed this engagement letter and understand the read-only scope of access.
            </span>
          </label>
        </div>
      ) : null}

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
