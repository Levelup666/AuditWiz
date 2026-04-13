import { redirect } from 'next/navigation'

/** Bookmarks from the old Audit Trail route. */
export default async function AuditTrailRedirectPage({
  searchParams,
}: {
  searchParams: Promise<{ studyId?: string }>
}) {
  const params = await searchParams
  const q = params.studyId
    ? `?studyId=${encodeURIComponent(params.studyId)}`
    : ''
  redirect(`/logs${q}`)
}
