'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { ButtonLoadingLabel } from '@/components/ui/button-loading-label'
import { toast } from '@/lib/toast'
import { notifyInvitesChanged } from '@/lib/invites/notify-invites-changed'

interface AcceptInstitutionInviteButtonProps {
  inviteId: string
  institutionId: string
  role: string
}

export default function AcceptInstitutionInviteButton({
  inviteId,
  institutionId,
  role,
}: AcceptInstitutionInviteButtonProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  async function handleAccept() {
    setLoading(true)
    try {
      const res = await fetch(`/api/institutions/${institutionId}/invites/accept`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invite_id: inviteId }),
      })
      const data = await res.json().catch(() => ({}))
      if (data?.requires_account_setup) {
        toast.error('Password required', 'Set a password in account setup before accepting this invite.')
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
      router.push(`/institutions/${institutionId}`)
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
