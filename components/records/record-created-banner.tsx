'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check, X } from 'lucide-react'

interface RecordCreatedBannerProps {
  show: boolean
}

export default function RecordCreatedBanner({ show }: RecordCreatedBannerProps) {
  const router = useRouter()
  const [dismissed, setDismissed] = useState(false)

  if (!show || dismissed) return null

  const dismiss = () => {
    setDismissed(true)
    router.replace(window.location.pathname, { scroll: false })
  }

  return (
    <div className="flex items-center justify-between gap-2 rounded-md border border-green-200 bg-green-50 px-4 py-2 text-sm text-green-800">
      <span className="inline-flex items-center gap-2">
        <Check className="h-4 w-4 text-green-600" />
        Record created successfully.
      </span>
      <button
        type="button"
        onClick={dismiss}
        className="rounded p-1 hover:bg-green-100"
        aria-label="Dismiss"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}
