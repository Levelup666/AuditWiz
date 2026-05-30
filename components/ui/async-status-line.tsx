import { Loader2 } from 'lucide-react'

type AsyncStatusLineProps = {
  message: string | null
}

/** Visible progress hint below forms or action groups (screen-reader friendly). */
export function AsyncStatusLine({ message }: AsyncStatusLineProps) {
  if (!message) return null
  return (
    <p
      role="status"
      aria-live="polite"
      className="flex items-center gap-2 text-sm text-muted-foreground"
    >
      <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden />
      {message}
    </p>
  )
}
