import { cookies } from 'next/headers'
import {
  ACTIVE_CONTEXT_COOKIE,
  resolveActiveContext,
  shouldPresentAuditorShell,
} from '@/lib/auditor/active-context'
import { userIsAuditorPrimary, userIsDualRoleAuditor } from '@/lib/auditor/is-auditor-primary'
import type { SupabaseClient } from '@supabase/supabase-js'
import { userHasActiveEngagement } from '@/lib/auditor/engagements'

/**
 * True when study/record deep links should use /auditor/engagements/... routes
 * (engagement-only user, or dual-role in auditor context).
 */
export async function shouldUseAuditorReviewRoutes(
  supabase: SupabaseClient,
  userId: string
): Promise<boolean> {
  const has = await userHasActiveEngagement(userId)
  if (!has) return false
  const auditorPrimary = await userIsAuditorPrimary(supabase, userId)
  const dualRole = !auditorPrimary ? await userIsDualRoleAuditor(supabase, userId) : false
  const jar = await cookies()
  const activeContext = resolveActiveContext({
    auditorPrimary,
    dualRole,
    cookieValue: jar.get(ACTIVE_CONTEXT_COOKIE)?.value,
  })
  return shouldPresentAuditorShell({ auditorPrimary, dualRole, activeContext })
}

export function auditorStudyPath(engagementId: string, studyId: string): string {
  return `/auditor/engagements/${engagementId}/studies/${studyId}`
}

export function auditorRecordPath(
  engagementId: string,
  studyId: string,
  recordId: string
): string {
  return `/auditor/engagements/${engagementId}/studies/${studyId}/records/${recordId}`
}
