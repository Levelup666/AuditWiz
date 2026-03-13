'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { toast } from '@/lib/toast'
import { Loader2 } from 'lucide-react'

interface ShareRecordButtonProps {
  recordId: string
  studyId: string
}

export default function ShareRecordButton({ recordId, studyId }: ShareRecordButtonProps) {
  const [loading, setLoading] = useState(false)
  const [shareUrl, setShareUrl] = useState<string | null>(null)

  const handleCreateShare = async () => {
    setLoading(true)
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
      toast.success('Share link created and copied to clipboard', 'Expires in 30 days. Read-only.')
    } catch (e) {
      toast.error('Share failed', e instanceof Error ? e.message : 'Failed to create share link')
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
        {loading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Creating…
          </>
        ) : (
          'Share Verified Record'
        )}
      </Button>
      {shareUrl && (
        <p className="text-sm text-muted-foreground">
          Link copied. Expires in 30 days. Read-only; no editing or re-sharing.
        </p>
      )}
    </div>
  )
}
