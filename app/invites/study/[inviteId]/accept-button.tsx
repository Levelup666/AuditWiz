'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { ButtonLoadingLabel } from '@/components/ui/button-loading-label'
import { toast } from '@/lib/toast'
import { notifyInvitesChanged } from '@/lib/invites/notify-invites-changed'

interface AcceptStudyInviteButtonProps {
  inviteId: string
  studyId: string
}

export default function AcceptStudyInviteButton({ inviteId, studyId }: AcceptStudyInviteButtonProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  async function handleAccept() {
    setLoading(true)
    try {
      const res = await fetch(`/api/studies/${studyId}/invites`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invite_id: inviteId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || res.statusText)
      toast.success('Invite accepted')
      notifyInvitesChanged()
      router.push(`/studies/${studyId}`)
      router.refresh()
    } catch (e) {
      toast.error('Accept failed', e instanceof Error ? e.message : 'Failed to accept invite')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Button onClick={handleAccept} disabled={loading} aria-busy={loading}>
      <ButtonLoadingLabel loading={loading} loadingLabel="Accepting…">
        Accept invite
      </ButtonLoadingLabel>
    </Button>
  )
}
