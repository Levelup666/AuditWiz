import { ShieldCheck } from 'lucide-react'

interface AuditorEngagementBannerProps {
  institutionName: string | null
  scopeLabel: string
  expiresAt: string
  startsAt: string
  purpose?: string | null
}

export default function AuditorEngagementBanner({
  institutionName,
  scopeLabel,
  expiresAt,
  startsAt,
  purpose,
}: AuditorEngagementBannerProps) {
  const expires = new Date(expiresAt)
  const now = new Date()
  const msLeft = expires.getTime() - now.getTime()
  const daysLeft = Math.max(0, Math.ceil(msLeft / (24 * 60 * 60 * 1000)))
  return (
    <div className="rounded-md border border-amber-200 bg-amber-50/70 p-3 text-amber-900">
      <div className="flex items-start gap-3">
        <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
        <div className="text-sm leading-relaxed">
          <div className="font-semibold">
            Read-only audit engagement{institutionName ? ` — ${institutionName}` : ''}
          </div>
          <div className="text-xs">
            Scope: <strong>{scopeLabel}</strong>
            {' · '}
            Window: {new Date(startsAt).toLocaleDateString()} – {expires.toLocaleDateString()}{' '}
            ({daysLeft} day{daysLeft === 1 ? '' : 's'} remaining)
            {purpose ? (
              <>
                {' · '}Purpose: <em>{purpose}</em>
              </>
            ) : null}
          </div>
          <div className="mt-1 text-xs text-amber-800/80">
            You can read records, signatures, anchors, and audit logs in scope. You cannot edit,
            sign, approve, or anchor anything. All access is logged.
          </div>
        </div>
      </div>
    </div>
  )
}
