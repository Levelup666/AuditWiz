'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { ButtonLoadingLabel } from '@/components/ui/button-loading-label'
import { toast } from '@/lib/toast'
import { notifyInvitesChanged } from '@/lib/invites/notify-invites-changed'

type DeclineInviteButtonProps = {
  kind: 'study' | 'institution'
  inviteId: string
  scopeId: string
}

export default function DeclineInviteButton({ kind, inviteId, scopeId }: DeclineInviteButtonProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  async function handleDecline() {
    setLoading(true)
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
      setLoading(false)
    }
  }

  return (
    <Button
      type="button"
      variant="outline"
      onClick={handleDecline}
      disabled={loading}
      aria-busy={loading}
    >
      <ButtonLoadingLabel loading={loading} loadingLabel="Declining…">
        Decline
      </ButtonLoadingLabel>
    </Button>
  )
}
