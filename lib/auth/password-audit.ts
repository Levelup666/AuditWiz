import { createAuditEvent } from '@/lib/supabase/audit'
import { generateHash } from '@/lib/crypto'
import type { PasswordRotationDays } from '@/lib/auth/password-policy'

export async function auditPasswordChanged(userId: string): Promise<void> {
  const hash = await generateHash({
    actor_id: userId,
    action: 'password_changed',
    at: new Date().toISOString(),
  })
  await createAuditEvent(
    null,
    userId,
    'password_changed',
    'user',
    userId,
    null,
    hash,
    {}
  )
}

export async function auditPasswordRotationPreferenceUpdated(
  userId: string,
  rotationDays: PasswordRotationDays,
  previousDays: number | null
): Promise<void> {
  const hash = await generateHash({
    actor_id: userId,
    rotation_days: rotationDays,
    previous_rotation_days: previousDays,
  })
  await createAuditEvent(
    null,
    userId,
    'password_rotation_preference_updated',
    'user',
    userId,
    null,
    hash,
    { rotation_days: rotationDays, previous_rotation_days: previousDays }
  )
}
