import { describe, expect, it } from 'vitest'
import type { NotificationInsert } from '@/lib/notifications/create-notification'

describe('notification insert shape', () => {
  it('supports v1 whitelist types', () => {
    const rows: NotificationInsert[] = [
      {
        user_id: 'user-1',
        type: 'study_task_assigned',
        title: 'Task assigned',
        dedupe_key: null,
      },
      {
        user_id: 'user-1',
        type: 'study_task_due_soon',
        title: 'Due soon',
        dedupe_key: 'task_due_24h:task-1:user-1',
      },
      {
        user_id: 'user-2',
        type: 'study_member_joined',
        title: 'New member',
      },
      {
        user_id: 'user-3',
        type: 'study_member_departed',
        title: 'Member left',
      },
      {
        user_id: 'user-4',
        type: 'study_deleted',
        title: 'Study deleted',
      },
    ]
    expect(rows).toHaveLength(5)
    expect(rows[1].dedupe_key).toContain('task_due_24h')
  })
})
