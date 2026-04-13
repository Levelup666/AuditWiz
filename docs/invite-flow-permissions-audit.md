# Invite flow — permissions audit (sampled)

Reviewed server entry points relevant to study/institution invites and member management. **No authorization gaps found** for the unified pending-invite behavior; all sampled mutations gate on `canManageStudyMembers` or `canManageInstitution`, and accept flows use `acceptStudyInviteForUser` / `acceptInstitutionInviteForUser` with invite-row RLS.

| Area | Check |
|------|--------|
| `POST` / `PATCH` [`app/api/studies/[id]/members/route.ts`](../app/api/studies/[id]/members/route.ts) | `canManageStudyMembers` |
| `POST` [`app/api/studies/[id]/invites/route.ts`](../app/api/studies/[id]/invites/route.ts) | `canManageStudyMembers` |
| `GET` [`app/api/studies/[id]/member-candidates/route.ts`](../app/api/studies/[id]/member-candidates/route.ts) | `canManageStudyMembers` |
| `POST` [`app/api/institutions/[id]/invites/route.ts`](../app/api/institutions/[id]/invites/route.ts) | `canManageInstitution` |
| `GET` / `PATCH` [`app/api/institutions/[id]/members/route.ts`](../app/api/institutions/[id]/members/route.ts) | `canManageInstitution` |
| [`app/studies/[id]/settings/actions.ts`](../app/studies/[id]/settings/actions.ts) `updateStudySettings` | `canManageStudyMembers` |

**Note:** UI should keep hiding member-management controls for users without these capabilities; extend the same checks when adding new study or institution actions.
