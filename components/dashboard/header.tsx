import { createClient } from '@/lib/supabase/server'
import OrcidBadge from '@/components/profile/orcid-badge'

function isOrcidProvider(p: unknown): boolean {
  return typeof p === 'string' && (p.startsWith('custom:orcid') || p === 'orcid')
}

export default async function Header() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  let orcidId: string | null = null
  let orcidVerified = false
  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('orcid_id, orcid_verified')
      .eq('id', user.id)
      .maybeSingle()
    orcidId = profile?.orcid_id ?? null
    orcidVerified = Boolean(profile?.orcid_verified)
  }

  const appMeta = (user?.app_metadata ?? {}) as { provider?: unknown; providers?: unknown }
  const providers = Array.isArray(appMeta.providers) ? appMeta.providers : []
  const signedInViaOrcid =
    isOrcidProvider(appMeta.provider) || providers.some(isOrcidProvider)

  return (
    <header className="flex h-16 items-center justify-between border-b bg-white px-6">
      <div className="flex items-center">
        <h2 className="text-lg font-semibold text-gray-900">AuditWiz Platform</h2>
      </div>
      <div className="flex items-center gap-3 text-sm text-gray-600">
        {orcidId && (
          <span
            className="flex items-center gap-1.5"
            title={
              signedInViaOrcid
                ? `Signed in with ORCID ${orcidId}`
                : `Verified ORCID ${orcidId}`
            }
          >
            <OrcidBadge orcidId={orcidId} verified={orcidVerified} />
            <span className="hidden font-mono text-xs sm:inline">{orcidId}</span>
            {signedInViaOrcid && (
              <span className="hidden rounded-full border border-[#a6ce39] bg-[#a6ce39]/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#5b7a14] sm:inline">
                ORCID
              </span>
            )}
          </span>
        )}
        <span className="font-medium">{user?.email}</span>
      </div>
    </header>
  )
}
