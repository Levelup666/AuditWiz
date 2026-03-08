'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'

interface ShareRecordButtonProps {
  recordId: string
  studyId: string
}

export default function ShareRecordButton({ recordId, studyId }: ShareRecordButtonProps) {
  const [loading, setLoading] = useState(false)
  const [shareUrl, setShareUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleCreateShare = async () => {
    setLoading(true)
    setError(null)
    setShareUrl(null)
    try {
      const res = await fetch('/api/share', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ record_version_id: recordId, expires_in_days: 30 }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to create share link')
      const url = typeof window !== 'undefined' ? `${window.location.origin}${data.share_url}` : data.share_url
      setShareUrl(url)
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create share link')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <Button
        variant="outline"
        onClick={handleCreateShare}
        disabled={loading}
      >
        {loading ? 'Creating…' : 'Share Verified Record'}
      </Button>
      {error && (
        <p className="text-sm text-red-600">{error}</p>
      )}
      {shareUrl && (
        <p className="text-sm text-gray-600">
          Share link created and copied. Expires in 30 days. Read-only; no editing or re-sharing.
        </p>
      )}
    </div>
  )
}
