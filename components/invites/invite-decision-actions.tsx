'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { AsyncStatusLine } from '@/components/ui/async-status-line'
import { ButtonLoadingLabel } from '@/components/ui/button-loading-label'
import { toast } from '@/lib/toast'
import { notifyInvitesChanged } from '@/lib/invites/notify-invites-changed'

type InviteKind = 'study' | 'institution'
type Busy = 'accept' | 'decline' | null

type InviteDecisionActionsProps = {
  kind: InviteKind
  inviteId: string
  scopeId: string
}

export default function InviteDecisionActions({
  kind,
  inviteId,
  scopeId,
}: InviteDecisionActionsProps) {
  const router = useRouter()
  const [busy, setBusy] = useState<Busy>(null)
  const disabled = busy !== null

  const statusMessage =
    busy === 'accept'
      ? kind === 'study'
        ? 'Adding you to the study…'
        : 'Adding you to the institution…'
      : busy === 'decline'
        ? 'Declining invitation…'
        : null

  async function handleAccept() {
    setBusy('accept')
    try {
      if (kind === 'study') {
        const res = await fetch(`/api/studies/${scopeId}/invites`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ invite_id: inviteId }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data.error || res.statusText)
        toast.success('Invite accepted')
        notifyInvitesChanged()
        router.push(`/studies/${scopeId}`)
      } else {
        const res = await fetch(`/api/institutions/${scopeId}/invites/accept`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ invite_id: inviteId }),
        })
        const data = await res.json().catch(() => ({}))
        if (data?.requires_account_setup) {
          toast.error(
            'Password required',
            'Set a password in account setup before accepting this invite.'
          )
          const path =
            typeof data.setup_path === 'string' && data.setup_path.startsWith('/account/setup')
              ? data.setup_path
              : `/account/setup?next=${encodeURIComponent(`/invites/institution/${inviteId}`)}&pending_invite=1`
          router.push(path)
          return
        }
        if (!res.ok) throw new Error(data.error || res.statusText)
        toast.success('Invite accepted')
        notifyInvitesChanged()
        router.push(`/institutions/${scopeId}`)
      }
      router.refresh()
    } catch (e) {
      toast.error('Accept failed', e instanceof Error ? e.message : 'Failed to accept invite')
    } finally {
      setBusy(null)
    }
  }

  async function handleDecline() {
    setBusy('decline')
    try {
      const url =
        kind === 'study'
          ? `/api/studies/${scopeId}/invites/decline`
          : `/api/institutions/${scopeId}/invites/decline`
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invite_id: inviteId }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || res.statusText)
      toast.success('Invitation declined')
      notifyInvitesChanged()
      router.push('/invites')
      router.refresh()
    } catch (e) {
      toast.error('Decline failed', e instanceof Error ? e.message : 'Failed to decline invite')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="space-y-3">
      <AsyncStatusLine message={statusMessage} />
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          onClick={handleAccept}
          disabled={disabled}
          aria-busy={busy === 'accept'}
        >
          <ButtonLoadingLabel loading={busy === 'accept'} loadingLabel="Accepting…">
            Accept invite
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
