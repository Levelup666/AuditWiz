'use client'

import { useEffect, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { CheckCircle2 } from 'lucide-react'

/** Visible confirmation after study creation (?created=1). */
export function StudyCreatedNotice() {
  const searchParams = useSearchParams()
  const pathname = usePathname()
  const router = useRouter()
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (searchParams.get('created') !== '1') return
    setVisible(true)
    const next = new URLSearchParams(searchParams.toString())
    next.delete('created')
    const q = next.toString()
    router.replace(q ? `${pathname}?${q}` : pathname)
  }, [searchParams, pathname, router])

  if (!visible) return null

  return (
    <div
      className="flex items-start gap-3 rounded-md border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-900"
      role="status"
    >
      <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-green-700" aria-hidden />
      <div>
        <p className="font-medium">Study created successfully</p>
        <p className="mt-0.5 text-green-800">
          You are the study admin. Add a record or invite members from Settings when you are ready.
        </p>
      </div>
    </div>
  )
}
