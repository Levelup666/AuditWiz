'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

interface AnchorRecordButtonProps {
  recordId: string
  studyId: string
  recordVersion: number
  canAnchor: boolean
}

interface AnchorStatus {
  anchored: boolean
  transaction_hash?: string | null
  block_number?: number | null
}

export default function AnchorRecordButton({
  recordId,
  studyId,
  recordVersion,
  canAnchor,
}: AnchorRecordButtonProps) {
  const router = useRouter()
  const [status, setStatus] = useState<AnchorStatus | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const check = async () => {
      const res = await fetch(`/api/records/${recordId}/anchor/status`)
      if (cancelled || !res.ok) return
      const data = await res.json()
      setStatus({ anchored: !!data.anchor, ...data.anchor })
    }
    check()
    return () => { cancelled = true }
  }, [recordId])

  const handleAnchor = async () => {
    setError(null)
    setLoading(true)
    try {
      const res = await fetch(`/api/records/${recordId}/anchor`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Anchor failed')
      setStatus({
        anchored: true,
        transaction_hash: data.transaction_hash,
        block_number: data.block_number,
      })
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Anchor failed')
    } finally {
      setLoading(false)
    }
  }

  if (status?.anchored) {
    return (
      <div className="flex items-center gap-2">
        <Badge variant="secondary">Blockchain anchored</Badge>
        {status.transaction_hash && (
          <span className="text-xs text-gray-500 truncate max-w-[120px]" title={status.transaction_hash}>
            {status.transaction_hash.slice(0, 10)}…
          </span>
        )}
      </div>
    )
  }

  if (!canAnchor) return null

  return (
    <div className="flex flex-col gap-1">
      <Button
        variant="outline"
        onClick={handleAnchor}
        disabled={loading}
      >
        {loading ? 'Anchoring…' : 'Anchor to blockchain'}
      </Button>
      {error && (
        <p className="text-xs text-red-600">{error}</p>
      )}
    </div>
  )
}
