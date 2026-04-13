import { ChevronDown } from 'lucide-react'

interface AuditTrailSectionProps {
  title: string
  description?: string
  eventCount?: number
  children: React.ReactNode
}

/**
 * Collapsible, scroll-constrained wrapper for audit timelines (native details).
 */
export function AuditTrailSection({
  title,
  description,
  eventCount,
  children,
}: AuditTrailSectionProps) {
  return (
    <details className="group rounded-lg border border-border bg-muted/20">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 p-3 text-left [&::-webkit-details-marker]:hidden">
        <div className="min-w-0 flex-1">
          <span className="font-medium text-foreground">{title}</span>
          {description ? (
            <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
          ) : null}
          {eventCount !== undefined ? (
            <p className="mt-0.5 text-xs text-muted-foreground">
              {eventCount === 0 ? 'No events' : `${eventCount} event${eventCount === 1 ? '' : 's'} in view`}
            </p>
          ) : null}
        </div>
        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
      </summary>
      <div className="border-t border-border px-3 pb-3 pt-2">
        <div className="max-h-[min(24rem,60vh)] overflow-y-auto pr-1">{children}</div>
      </div>
    </details>
  )
}
