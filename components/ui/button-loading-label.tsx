import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

type ButtonLoadingLabelProps = {
  loading: boolean
  children: React.ReactNode
  loadingLabel?: React.ReactNode
  className?: string
}

/** Spinner + label for buttons during async work (keeps layout stable). */
export function ButtonLoadingLabel({
  loading,
  children,
  loadingLabel,
  className,
}: ButtonLoadingLabelProps) {
  if (!loading) {
    return <>{children}</>
  }
  return (
    <span className={cn('inline-flex items-center', className)}>
      <Loader2 className="mr-2 h-4 w-4 shrink-0 animate-spin" aria-hidden />
      <span>{loadingLabel ?? children}</span>
    </span>
  )
}
