/**
 * Email study admins when a member voluntarily leaves a study.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { sendTransactionalEmail } from '@/lib/email/send-transactional'

function appBaseUrl(): string {
  if (process.env.NEXT_PUBLIC_APP_URL) {
    return process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, '')
  }
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`
  }
  return 'http://localhost:3000'
}

export type StudyMemberDepartedEmailResult = {
  sent: boolean
  reason?: 'no_postmark_token' | 'no_from_address' | 'postmark_error' | 'no_recipients'
}

export async function sendStudyMemberDepartedEmails(params: {
  adminEmails: string[]
  studyTitle: string
  studyId: string
  departedMemberLabel: string
}): Promise<StudyMemberDepartedEmailResult> {
  const { adminEmails, studyTitle, studyId, departedMemberLabel } = params
  const recipients = adminEmails.filter(Boolean)
  if (recipients.length === 0) {
    return { sent: false, reason: 'no_recipients' }
  }

  const studyUrl = `${appBaseUrl()}/studies/${studyId}`
  const subject = `Member left study: ${studyTitle}`
  const text = [
    `${departedMemberLabel} voluntarily left the study "${studyTitle}".`,
    '',
    'They no longer have access to this study and were removed from open task assignments.',
    '',
    `Open study: ${studyUrl}`,
    '',
    'This is an operational notice for study administrators.',
  ].join('\n')

  const result = await sendTransactionalEmail({
    to: recipients,
    subject,
    text,
  })

  return result
}

/** User IDs with can_manage_members on an active study assignment. */
export async function getStudyManagerUserIds(
  admin: SupabaseClient,
  studyId: string
): Promise<string[]> {
  const { data: defs, error: defErr } = await admin
    .from('study_role_definitions')
    .select('id')
    .eq('study_id', studyId)
    .eq('can_manage_members', true)

  if (defErr || !defs?.length) {
    const { data: legacyAdmins } = await admin
      .from('study_members')
      .select('user_id')
      .eq('study_id', studyId)
      .eq('role', 'admin')
      .is('revoked_at', null)
    return [...new Set((legacyAdmins ?? []).map((r) => r.user_id as string))]
  }

  const defIds = defs.map((d) => d.id as string)
  const { data: assigns, error: assignErr } = await admin
    .from('study_member_role_assignments')
    .select('user_id')
    .eq('study_id', studyId)
    .in('role_definition_id', defIds)
    .is('revoked_at', null)

  if (assignErr) return []
  return [...new Set((assigns ?? []).map((a) => a.user_id as string))]
}

export async function resolveUserEmail(
  admin: SupabaseClient,
  userId: string
): Promise<string | null> {
  try {
    const { data: u } = await admin.auth.admin.getUserById(userId)
    return u?.user?.email ?? null
  } catch {
    return null
  }
}

export async function resolveUserEmails(
  admin: SupabaseClient,
  userIds: string[]
): Promise<string[]> {
  const emails: string[] = []
  for (const id of userIds) {
    const email = await resolveUserEmail(admin, id)
    if (email) emails.push(email)
  }
  return emails
}
