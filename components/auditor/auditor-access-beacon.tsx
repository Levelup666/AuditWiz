'use client'

import { useEffect } from 'react'

type Surface = 'auditor_hub' | 'study' | 'record' | 'logs'

/**
 * Fires once per browser tab session per engagement to record audit_engagement_accessed.
 * Server also dedupes via httpOnly cookie.
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
    const key = `aw_eng_access_${engagementId}`
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
