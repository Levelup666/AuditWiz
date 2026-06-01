import type { SupabaseClient } from '@supabase/supabase-js'
import { createNotifications, createNotificationIfNew } from '@/lib/notifications/create-notification'
import { resolveMemberDisplayName } from '@/lib/profile/resolve-member-display'
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

async function resolveUserEmail(admin: SupabaseClient, userId: string): Promise<string | null> {
  try {
    const { data: u } = await admin.auth.admin.getUserById(userId)
    return u?.user?.email ?? null
  } catch {
    return null
  }
}

/** Emails for assignees who opted in to study-activity mail (default on). */
async function resolveStudyActivityEmailRecipients(
  admin: SupabaseClient,
  userIds: string[]
): Promise<Array<{ userId: string; email: string }>> {
  if (userIds.length === 0) return []

  const { data: profiles } = await admin
    .from('profiles')
    .select('id, notification_email_study_activity')
    .in('id', userIds)

  const wantsEmailById = new Map(
    (profiles ?? []).map((p) => [
      p.id as string,
      p.notification_email_study_activity !== false,
    ])
  )

  const recipients: Array<{ userId: string; email: string }> = []
  for (const userId of userIds) {
    if (wantsEmailById.get(userId) === false) continue
    const email = await resolveUserEmail(admin, userId)
    if (email) recipients.push({ userId, email })
  }
  return recipients
}

async function loadMemberLabel(
  admin: SupabaseClient,
  userId: string
): Promise<string> {
  const { data: profile } = await admin
    .from('profiles')
    .select('display_name, first_name, last_name, nickname')
    .eq('id', userId)
    .maybeSingle()

  let email = ''
  let userMetadata: Record<string, unknown> | undefined
  try {
    const { data: u } = await admin.auth.admin.getUserById(userId)
    email = u?.user?.email ?? ''
    userMetadata = u?.user?.user_metadata as Record<string, unknown> | undefined
  } catch {
    email = ''
  }

  return resolveMemberDisplayName(profile, userMetadata, email) || email || 'A member'
}

export async function notifyStudyMemberJoined(
  admin: SupabaseClient,
  studyId: string,
  newUserId: string,
  studyTitle: string
): Promise<void> {
  const { data: members } = await admin
    .from('study_members')
    .select('user_id')
    .eq('study_id', studyId)
    .is('revoked_at', null)

  const recipientIds = (members ?? [])
    .map((m) => m.user_id as string)
    .filter((id) => id !== newUserId)

  if (recipientIds.length === 0) return

  const label = await loadMemberLabel(admin, newUserId)

  await createNotifications(
    admin,
    recipientIds.map((user_id) => ({
      user_id,
      type: 'study_member_joined' as const,
      title: 'New study member',
      body: `${label} joined "${studyTitle}".`,
      metadata: { study_id: studyId, study_title: studyTitle, user_id: newUserId },
    }))
  )
}

export async function notifyStudyMemberDeparted(
  admin: SupabaseClient,
  params: {
    studyId: string
    studyTitle: string
    departedUserId: string
    adminUserIds: string[]
  }
): Promise<void> {
  const { studyId, studyTitle, departedUserId, adminUserIds } = params
  const recipients = adminUserIds.filter((id) => id !== departedUserId)
  if (recipients.length === 0) return

  const label = await loadMemberLabel(admin, departedUserId)

  await createNotifications(
    admin,
    recipients.map((user_id) => ({
      user_id,
      type: 'study_member_departed' as const,
      title: 'Member left study',
      body: `${label} left "${studyTitle}".`,
      metadata: {
        study_id: studyId,
        study_title: studyTitle,
        user_id: departedUserId,
        self_departed: true,
      },
    }))
  )
}

export async function notifyTaskAssigned(
  admin: SupabaseClient,
  params: {
    studyId: string
    studyTitle: string
    taskId: string
    taskTitle: string
    assigneeUserIds: string[]
    dueAt?: string | null
  }
): Promise<void> {
  const { studyId, studyTitle, taskId, taskTitle, assigneeUserIds, dueAt } = params
  if (assigneeUserIds.length === 0) return

  const dueLine =
    dueAt?.trim()
      ? ` Due ${new Date(dueAt).toLocaleDateString(undefined, { dateStyle: 'medium' })}.`
      : ''

  await createNotifications(
    admin,
    assigneeUserIds.map((user_id) => ({
      user_id,
      type: 'study_task_assigned' as const,
      title: 'Task assigned to you',
      body: `"${taskTitle}" on "${studyTitle}".${dueLine}`,
      metadata: {
        study_id: studyId,
        study_title: studyTitle,
        task_id: taskId,
        task_title: taskTitle,
      },
    }))
  )

  const emailRecipients = await resolveStudyActivityEmailRecipients(admin, assigneeUserIds)
  if (emailRecipients.length === 0) return

  const studyUrl = `${appBaseUrl()}/studies/${studyId}`
  const dueLabel = dueAt?.trim()
    ? new Date(dueAt).toLocaleDateString(undefined, { dateStyle: 'medium' })
    : null
  const subject = `Task assigned: ${taskTitle}`

  for (const { email } of emailRecipients) {
    const text = [
      `You were assigned a task on AuditWiz.`,
      '',
      `Study: ${studyTitle}`,
      `Task: ${taskTitle}`,
      dueLabel ? `Due: ${dueLabel}` : 'Due: No due date set',
      '',
      `Open the study: ${studyUrl}`,
      '',
      'You can change study activity email preferences in Account setup.',
    ].join('\n')

    const result = await sendTransactionalEmail({ to: email, subject, text })
    if (!result.sent && process.env.NODE_ENV === 'development') {
      console.info('[task-assigned-email] not sent', { email, reason: result.reason })
    }
  }
}

export async function notifyTaskDueSoon(
  admin: SupabaseClient,
  params: {
    studyId: string
    studyTitle: string
    taskId: string
    taskTitle: string
    dueAt: string
    assigneeUserIds: string[]
  }
): Promise<void> {
  const { studyId, studyTitle, taskId, taskTitle, dueAt, assigneeUserIds } = params
  if (assigneeUserIds.length === 0) return

  const dueLabel = new Date(dueAt).toLocaleDateString(undefined, { dateStyle: 'medium' })

  for (const user_id of assigneeUserIds) {
    await createNotificationIfNew(admin, {
      user_id,
      type: 'study_task_due_soon',
      title: 'Task due soon',
      body: `"${taskTitle}" on "${studyTitle}" is due ${dueLabel}.`,
      metadata: {
        study_id: studyId,
        study_title: studyTitle,
        task_id: taskId,
        task_title: taskTitle,
        due_at: dueAt,
      },
      dedupe_key: `task_due_24h:${taskId}:${user_id}`,
    })
  }
}
