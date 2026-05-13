import {
  formatMemberListName,
  memberDisplayHintsFromAuthMetadata,
  type MemberDisplayProfileInput,
} from '@/lib/profile/member-display-name'

/** Profile fields used for member lists (from `profiles` row or partial). */
export type MemberProfileForList = Pick<
  MemberDisplayProfileInput,
  'nickname' | 'first_name' | 'last_name' | 'display_name'
>

/**
 * Single place to derive a peer-visible list label: profile wins over Auth
 * `user_metadata` (signup/OAuth), then email.
 */
export function resolveMemberDisplayName(
  prof: MemberProfileForList | null | undefined,
  userMetadata: Record<string, unknown> | null | undefined,
  email: string | null | undefined
): string {
  const hints = memberDisplayHintsFromAuthMetadata(userMetadata ?? undefined)
  return formatMemberListName(
    {
      nickname: prof?.nickname?.trim() || hints.nickname,
      first_name: prof?.first_name?.trim() || hints.first_name,
      last_name: prof?.last_name?.trim() || hints.last_name,
      display_name: prof?.display_name?.trim() || hints.display_name,
    },
    { email: email ?? undefined }
  )
}
