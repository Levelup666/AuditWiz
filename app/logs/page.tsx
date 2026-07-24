import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getStudyIdsWhereUserCanAudit } from '@/lib/supabase/permissions'
import { getAuditUiRetentionDays } from '@/lib/audit-ui-retention'
import LogsExplorer from '@/components/logs/logs-explorer'
import { listActiveEngagementsForUser } from '@/lib/auditor/engagements'
import AuditorAccessBeacon from '@/components/auditor/auditor-access-beacon'
import { userIsAuditorPrimary } from '@/lib/auditor/is-auditor-primary'

export default async function LogsPage({
  searchParams,
}: {
  searchParams: Promise<{ studyId?: string }>
}) {
  const params = await searchParams
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/auth/signin')
  }

  const auditStudyIds = await getStudyIdsWhereUserCanAudit(user.id)
  const auditorPrimary = await userIsAuditorPrimary(supabase, user.id)
  const engagements = auditorPrimary
    ? await listActiveEngagementsForUser(supabase, user.id)
    : []

  if (auditStudyIds.length === 0) {
    return (
      <div className="mx-auto max-w-lg space-y-4 py-16 text-center">
        <h1 className="text-2xl font-semibold text-gray-900">Logs</h1>
        <p className="text-gray-600">
          Audit logs are available to study <strong>auditors</strong> and <strong>admins</strong>{' '}
          only. Ask a study admin to assign you one of those roles if you need access.
        </p>
        <Link href={auditorPrimary ? '/auditor' : '/studies'} className="text-primary underline">
          {auditorPrimary ? 'Back to audit workspace' : 'Back to studies'}
        </Link>
      </div>
    )
  }

  const { data: studies, error } = await supabase
    .from('studies')
    .select('id, title, institution_id')
    .in('id', auditStudyIds)
    .order('title')

  if (error) {
    throw new Error(`Failed to load studies: ${error.message}`)
  }

  const rows = studies ?? []
  const instIds = [
    ...new Set(
      rows
        .map((s) => s.institution_id)
        .filter((id): id is string => id !== null && id !== undefined)
    ),
  ]

  let institutionNames: Record<string, string> = {}
  if (instIds.length > 0) {
    const { data: insts } = await supabase
      .from('institutions')
      .select('id, name')
      .in('id', instIds)
    institutionNames = Object.fromEntries((insts ?? []).map((i) => [i.id, i.name]))
  }

  return (
    <>
      {engagements[0] ? (
        <AuditorAccessBeacon engagementId={engagements[0].id} surface="logs" />
      ) : null}
      <LogsExplorer
        studies={rows}
        institutionNames={institutionNames}
        initialStudyId={params.studyId ?? null}
        retentionDays={getAuditUiRetentionDays()}
      />
    </>
  )
}
