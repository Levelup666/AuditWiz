-- Supabase auto-grants EXECUTE on new public functions to anon, authenticated, and
-- service_role directly. REVOKE FROM PUBLIC alone does not remove direct anon grants.
-- Explicitly revoke anon (and PUBLIC) on SECURITY DEFINER helpers, then re-grant
-- only to the roles that should call them.

-- Audit engagement helpers
REVOKE ALL ON FUNCTION public.audit_engagement_is_active(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.audit_engagement_is_active(UUID, UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.audit_engagement_study_ids_for_user(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.audit_engagement_study_ids_for_user(UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.is_audit_engagement_viewer_of_study(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_audit_engagement_viewer_of_study(UUID, UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.is_audit_engagement_viewer_of_institution(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_audit_engagement_viewer_of_institution(UUID, UUID) TO authenticated;

-- Audit + share RPC
REVOKE ALL ON FUNCTION public.create_audit_event(
  UUID, UUID, TEXT, TEXT, UUID, TEXT, TEXT, JSONB
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_audit_event(
  UUID, UUID, TEXT, TEXT, UUID, TEXT, TEXT, JSONB
) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.create_share_access_event(UUID, INET, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_share_access_event(UUID, INET, TEXT) TO service_role;

-- Study capability / membership helpers
REVOKE ALL ON FUNCTION public.is_study_member(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_study_member(UUID, UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.is_study_admin(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_study_admin(UUID, UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.study_user_can_manage_members(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.study_user_can_manage_members(UUID, UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.study_member_can_view(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.study_member_can_view(UUID, UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.is_study_member_can_view(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_study_member_can_view(UUID, UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.study_member_can_share(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.study_member_can_share(UUID, UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.study_user_can_edit_record_drafts(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.study_user_can_edit_record_drafts(UUID, UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.study_user_can_moderate_record_status(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.study_user_can_moderate_record_status(UUID, UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.study_user_can_anchor_records(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.study_user_can_anchor_records(UUID, UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.get_user_study_role(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_user_study_role(UUID, UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.is_study_admin_role_only(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_study_admin_role_only(UUID, UUID) TO authenticated;

-- Institution helpers
REVOKE ALL ON FUNCTION public.institution_member_is_active(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.institution_member_is_active(UUID, UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.institution_member_is_admin(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.institution_member_is_admin(UUID, UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.institution_invite_pending_for_current_user(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.institution_invite_pending_for_current_user(UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.institution_invite_invitee_matches_auth_user(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.institution_invite_invitee_matches_auth_user(UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.institution_external_collaborator_rows(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.institution_external_collaborator_rows(UUID) TO authenticated;

-- Authenticated RPC entry points
REVOKE ALL ON FUNCTION public.audit_events_page_for_viewer(
  TIMESTAMPTZ, UUID[], TEXT, TIMESTAMPTZ, UUID, INT
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.audit_events_page_for_viewer(
  TIMESTAMPTZ, UUID[], TEXT, TIMESTAMPTZ, UUID, INT
) TO authenticated;

REVOKE ALL ON FUNCTION public.complete_study_task_after_record(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.complete_study_task_after_record(UUID, UUID) TO authenticated;

-- Trigger functions (block direct anon RPC)
REVOKE ALL ON FUNCTION public.audit_record_change() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.audit_record_change() TO authenticated;

REVOKE ALL ON FUNCTION public.audit_signature_added() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.audit_signature_added() TO authenticated;

REVOKE ALL ON FUNCTION public.enforce_one_study_role_per_user() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.enforce_one_study_role_per_user() TO authenticated;

REVOKE ALL ON FUNCTION public.sync_study_member_from_role_assignment() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sync_study_member_from_role_assignment() TO authenticated;

REVOKE ALL ON FUNCTION public.seed_study_role_definitions_for_new_study() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.seed_study_role_definitions_for_new_study() TO authenticated;

-- Future SECURITY DEFINER functions: do not auto-grant anon execute
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM anon;
