import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { createAuditEvent } from '@/lib/supabase/audit'
import { generateHash } from '@/lib/crypto'

const COOKIE_PREFIX = 'aw_eng_access_'
/** Per-surface/entity dedupe within a browser session (~12h). */
const COOKIE_MAX_AGE_SEC = 60 * 60 * 12

type Surface = 'auditor_hub' | 'study' | 'record' | 'logs'

function dedupeCookieName(
  engagementId: string,
  surface: Surface,
  studyId: string | null,
  recordId: string | null
): string {
  const entity =
    surface === 'record' && recordId
      ? `record_${recordId}`
      : surface === 'study' && studyId
        ? `study_${studyId}`
        : surface
  // Cookie names must be modest length; truncate engagement id.
  return `${COOKIE_PREFIX}${engagementId.slice(0, 8)}_${entity}`.slice(0, 64)
}

export async function POST(
  request: NextRequest,
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

  const body = await request.json().catch(() => ({}))
  const surface = (body.surface as Surface) || 'auditor_hub'
  const studyId = typeof body.study_id === 'string' ? body.study_id : null
  const recordId = typeof body.record_id === 'string' ? body.record_id : null

  const { data: engagement } = await supabase
    .from('audit_engagements')
    .select('id, accepted_at, revoked_at, starts_at, expires_at')
    .eq('id', engagementId)
    .eq('auditor_user_id', user.id)
    .maybeSingle()

  if (!engagement?.accepted_at || engagement.revoked_at) {
    return NextResponse.json({ error: 'Engagement not found' }, { status: 404 })
  }
  const now = new Date()
  if (new Date(engagement.starts_at) > now || new Date(engagement.expires_at) <= now) {
    return NextResponse.json({ error: 'Engagement not active' }, { status: 403 })
  }

  const jar = await cookies()
  const name = dedupeCookieName(engagementId, surface, studyId, recordId)
  if (jar.get(name)?.value === '1') {
    return NextResponse.json({ emitted: false, deduped: true })
  }

  try {
    const stateHash = await generateHash({
      engagement_id: engagementId,
      actor_id: user.id,
      surface,
      study_id: studyId,
      record_id: recordId,
      at: new Date().toISOString(),
    })
    await createAuditEvent(
      studyId,
      user.id,
      'audit_engagement_accessed',
      'audit_engagement',
      engagementId,
      null,
      stateHash,
      { surface, study_id: studyId, record_id: recordId }
    )
  } catch (e) {
    console.error('audit_engagement_accessed failed', e)
    return NextResponse.json({ error: 'Failed to record access' }, { status: 500 })
  }

  const res = NextResponse.json({ emitted: true })
  res.cookies.set(name, '1', {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: COOKIE_MAX_AGE_SEC,
  })
  return res
}
