'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { toast } from '@/lib/toast'

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
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || res.statusText)
      toast.success('Invite accepted')
      router.push(`/institutions/${institutionId}`)
      router.refresh()
    } catch (e) {
      toast.error('Accept failed', e instanceof Error ? e.message : 'Failed to accept invite')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Button onClick={handleAccept} disabled={loading}>
      {loading ? 'Accepting…' : 'Accept invite'}
    </Button>
  )
}
