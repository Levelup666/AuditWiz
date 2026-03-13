'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { toast } from '@/lib/toast'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export default function LinkOrcidForm() {
  const [orcidId, setOrcidId] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!orcidId.trim()) return
    setLoading(true)
    try {
      const res = await fetch('/api/profile/orcid/link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orcid_id: orcidId.trim(),
          verified: false,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to link ORCID')
      toast.success('ORCID linked successfully')
      setOrcidId('')
      window.dispatchEvent(new Event('profile-updated'))
    } catch (e) {
      toast.error('Link failed', e instanceof Error ? e.message : 'Failed to link ORCID')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <Label htmlFor="orcid-id">ORCID iD</Label>
        <Input
          id="orcid-id"
          type="text"
          value={orcidId}
          onChange={(e) => setOrcidId(e.target.value)}
          placeholder="0000-0001-2345-6789"
          className="mt-1 max-w-xs"
        />
      </div>
      <Button type="submit" disabled={loading}>
        {loading ? 'Linking…' : 'Link ORCID'}
      </Button>
    </form>
  )
}
