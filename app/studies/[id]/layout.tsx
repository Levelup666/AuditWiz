import { createClient } from '@/lib/supabase/server'
import { getStudyMemberPermissions } from '@/lib/supabase/permissions'
import StudyScopeProvider, {
  StudyActingAsBar,
  type StudyScopeCaps,
  type StudyScopeInitial,
} from '@/components/studies/study-scope-provider'

export default async function StudyIdLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ id: string }>
}) {
  const { id: studyId } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  let initial: StudyScopeInitial = {
    hasMembership: false,
    roles: [],
    caps: null,
  }

  if (user) {
    const perms = await getStudyMemberPermissions(user.id, studyId)
    if (perms) {
      const caps: StudyScopeCaps = {
        can_review: perms.can_review,
        can_approve: perms.can_approve,
        can_access_audit_hub: perms.can_access_audit_hub,
        can_manage_members: perms.can_manage_members,
        can_create_records: perms.can_create_records,
      }
      initial = {
        hasMembership: true,
        roles: perms.roles,
        caps,
      }
    }
  }

  return (
    <StudyScopeProvider studyId={studyId} initial={initial}>
      <StudyActingAsBar />
      {children}
    </StudyScopeProvider>
  )
}
