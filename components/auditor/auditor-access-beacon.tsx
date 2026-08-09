'use client'

import { useEffect } from 'react'

type Surface = 'auditor_hub' | 'study' | 'record' | 'logs'

/**
 * Records audit_engagement_accessed once per (engagement, surface, study/record) per tab session.
 * Server also dedupes via httpOnly cookie with the same key shape.
 */
export default function AuditorAccessBeacon({
  engagementId,
  surface,
  studyId,
  recordId,
}: {
  engagementId: string
  surface: Surface
  studyId?: string
  recordId?: string
}) {
  useEffect(() => {
    const entity =
      surface === 'record' && recordId
        ? `record_${recordId}`
        : surface === 'study' && studyId
          ? `study_${studyId}`
          : surface
    const key = `aw_eng_access_${engagementId}_${entity}`
    try {
      if (sessionStorage.getItem(key) === '1') return
      sessionStorage.setItem(key, '1')
    } catch {
      /* private mode — still attempt server dedupe */
    }
    void fetch(`/api/auditor/engagements/${engagementId}/access`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        surface,
        study_id: studyId ?? null,
        record_id: recordId ?? null,
      }),
    }).catch(() => {})
  }, [engagementId, surface, studyId, recordId])

  return null
}
