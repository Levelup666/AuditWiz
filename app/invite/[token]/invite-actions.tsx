'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { toast } from '@/lib/toast'
import { createClient } from '@/lib/supabase/client'

type InviteActionsProps = {
  rawToken: string
  canAccept: boolean
}

export default function InviteActions({ rawToken, canAccept }: InviteActionsProps) {
  const router = useRouter()
  const [loading, setLoading] = useState<'accept' | 'decline' | null>(null)

  async function postJson(url: string) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: rawToken }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.error || res.statusText)
    return data as { study_id?: string; institution_id?: string; kind?: string }
  }

  async function handleAccept() {
    setLoading('accept')
    try {
      const data = await postJson('/api/invites/accept')
      toast.success('Invitation accepted')
      if (data.kind === 'study' && data.study_id) {
        router.push(`/studies/${data.study_id}`)
      } else if (data.kind === 'institution' && data.institution_id) {
        router.push(`/institutions`)
      } else {
        router.push('/studies')
      }
      router.refresh()
    } catch (e) {
      toast.error('Could not accept', e instanceof Error ? e.message : 'Failed')
    } finally {
      setLoading(null)
    }
  }

  async function handleDecline() {
    setLoading('decline')
    try {
      await postJson('/api/invites/decline')
      toast.success('Invitation declined')
      router.push('/studies')
      router.refresh()
    } catch (e) {
      toast.error('Could not decline', e instanceof Error ? e.message : 'Failed')
    } finally {
      setLoading(null)
    }
  }

  async function handleSignOutDifferent() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push(
      `/auth/signin?redirectedFrom=${encodeURIComponent(`/invite/${rawToken}`)}&inviteNotice=${encodeURIComponent('Sign in with the invited email or ORCID.')}`
    )
    router.refresh()
  }

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
      {canAccept && (
        <>
          <Button onClick={handleAccept} disabled={loading !== null}>
            {loading === 'accept' ? 'Accepting…' : 'Accept invite'}
          </Button>
          <Button variant="outline" onClick={handleDecline} disabled={loading !== null}>
            {loading === 'decline' ? 'Declining…' : 'Decline'}
          </Button>
        </>
      )}
      {!canAccept && (
        <Button type="button" variant="secondary" onClick={handleSignOutDifferent}>
          Sign out and use a different account
        </Button>
      )}
    </div>
  )
}
