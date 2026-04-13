import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getActorEmailsForAudit } from '@/lib/audit/get-actor-emails'
import { decodeAuditEventsCursor, encodeAuditEventsCursor } from '@/lib/audit/cursor'
import { listAuditEventsPage } from '@/lib/supabase/audit'
import { getStudyIdsWhereUserCanAudit } from '@/lib/supabase/permissions'
import { SYSTEM_ACTOR_ID } from '@/lib/types'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const auditStudyIds = await getStudyIdsWhereUserCanAudit(user.id)
  if (auditStudyIds.length === 0) {
    return NextResponse.json(
      { error: 'You do not have access to audit logs' },
      { status: 403 }
    )
  }

  const { searchParams } = new URL(request.url)
  const studyIdParam = searchParams.get('studyId')
  const institutionId = searchParams.get('institutionId')
  const noInstitution = searchParams.get('noInstitution') === 'true'
  const targetEntityType = searchParams.get('targetEntityType')
  const cursorParam = searchParams.get('cursor')
  const limit = Math.min(Number(searchParams.get('limit')) || 40, 100)

  let studyIds = auditStudyIds

  if (studyIdParam) {
    if (!auditStudyIds.includes(studyIdParam)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    studyIds = [studyIdParam]
  } else if (noInstitution) {
    const allowed = new Set(auditStudyIds)
    const { data: instStudies, error } = await supabase
      .from('studies')
      .select('id')
      .is('institution_id', null)
      .in('id', [...allowed])

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    studyIds = (instStudies ?? []).map((r) => r.id).filter((id) => allowed.has(id))
    if (studyIds.length === 0) {
      return NextResponse.json({
        events: [],
        nextCursor: null,
        nextCursorEncoded: null,
        actorEmails: {},
      })
    }
  } else if (institutionId) {
    const allowed = new Set(auditStudyIds)
    const { data: instStudies, error } = await supabase
      .from('studies')
      .select('id')
      .eq('institution_id', institutionId)
      .in('id', [...allowed])

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    studyIds = (instStudies ?? []).map((r) => r.id).filter((id) => allowed.has(id))
    if (studyIds.length === 0) {
      return NextResponse.json({
        events: [],
        nextCursor: null,
        nextCursorEncoded: null,
        actorEmails: {},
      })
    }
  }

  const cursor = decodeAuditEventsCursor(cursorParam)

  try {
    const { events, nextCursor } = await listAuditEventsPage({
      studyIds,
      targetEntityType: targetEntityType?.trim() || null,
      cursor,
      limit,
    })

    const actorIds = [
      ...new Set(
        events
          .map((e) => e.actor_id as string | null)
          .filter((id): id is string => !!id && id !== SYSTEM_ACTOR_ID)
      ),
    ]
    const actorEmails = await getActorEmailsForAudit(actorIds)

    return NextResponse.json({
      events,
      actorEmails,
      nextCursor,
      nextCursorEncoded: nextCursor ? encodeAuditEventsCursor(nextCursor) : null,
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to load events'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
