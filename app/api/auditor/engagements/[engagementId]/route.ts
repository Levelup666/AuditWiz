import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getOwnedActiveEngagement } from '@/lib/auditor/assert-engagement-access'

/**
 * Read-only auditor API: engagement detail (credentials, COI hashes, letter metadata).
 * For tooling that should not use the full UI.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ engagementId: string }> }
) {
  const { engagementId } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const engagement = await getOwnedActiveEngagement(supabase, user.id, engagementId)
  if (!engagement) {
    return NextResponse.json({ error: 'Engagement not found or not active' }, { status: 404 })
  }

  const { data: institution } = await supabase
    .from('institutions')
    .select('id, name')
    .eq('id', engagement.institution_id)
    .maybeSingle()

  return NextResponse.json({
    engagement: {
      id: engagement.id,
      institution_id: engagement.institution_id,
      institution_name: institution?.name ?? null,
      scope: engagement.scope,
      purpose: engagement.purpose,
      starts_at: engagement.starts_at,
      expires_at: engagement.expires_at,
      accepted_at: engagement.accepted_at,
      credentials: {
        organization_name: engagement.auditor_organization_name,
        title: engagement.auditor_title,
        reference_id: engagement.auditor_reference_id,
        attested_at: engagement.attested_at,
        attestation_text_hash: engagement.attestation_text_hash,
      },
      coi: {
        declared_at: engagement.coi_declared_at,
        statement_hash: engagement.coi_statement_hash,
        has_conflict: engagement.coi_has_conflict,
        disclosure: engagement.coi_disclosure,
      },
      engagement_letter: engagement.engagement_letter_file_hash
        ? {
            file_name: engagement.engagement_letter_file_name,
            file_hash: engagement.engagement_letter_file_hash,
            file_size: engagement.engagement_letter_file_size,
            mime_type: engagement.engagement_letter_mime_type,
            uploaded_at: engagement.engagement_letter_uploaded_at,
            download_path: `/api/auditor/engagements/${engagement.id}/letter`,
          }
        : null,
      read_only: true,
    },
  })
}
