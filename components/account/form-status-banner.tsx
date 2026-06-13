'use client'

import { useEffect, useState } from 'react'
import { CircleCheck, OctagonX } from 'lucide-react'

export type FormStatus = {
  kind: 'success' | 'error'
  message: string
} | null

export function useFormStatus(autoClearMs = 6000) {
  const [status, setStatus] = useState<FormStatus>(null)

  useEffect(() => {
    if (!status) return
    const timer = window.setTimeout(() => setStatus(null), autoClearMs)
    return () => window.clearTimeout(timer)
  }, [status, autoClearMs])

  return { status, setStatus }
}

export function FormStatusBanner({ status }: { status: FormStatus }) {
  if (!status) return null

  const isSuccess = status.kind === 'success'

  return (
    <div
      role="status"
      aria-live="polite"
      className={
        isSuccess
          ? 'rounded-lg border border-emerald-200 bg-emerald-50/90 px-4 py-3 text-sm text-emerald-950 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-100'
          : 'rounded-lg border border-red-200 bg-red-50/90 px-4 py-3 text-sm text-red-950 dark:border-red-900 dark:bg-red-950/30 dark:text-red-100'
      }
    >
      <p className="flex items-start gap-2">
        {isSuccess ? (
          <CircleCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        ) : (
          <OctagonX className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        )}
        <span>{status.message}</span>
      </p>
    </div>
  )
}
