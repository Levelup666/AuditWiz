'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export default function LinkOrcidForm() {
  const [orcidId, setOrcidId] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSuccess(false)
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
      setSuccess(true)
      setOrcidId('')
      window.dispatchEvent(new Event('profile-updated'))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to link ORCID')
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
      {error && <p className="text-sm text-red-600">{error}</p>}
      {success && <p className="text-sm text-green-600">ORCID linked successfully.</p>}
    </form>
  )
}
