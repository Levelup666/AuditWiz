-- Revoke default PUBLIC EXECUTE on SECURITY DEFINER functions exposed in public schema.
-- Anon must not invoke definer helpers via PostgREST RPC (membership oracle, audit forge, etc.).
-- service_role retains execute for server-side admin client paths (share logging, invite audit).

-- ---------------------------------------------------------------------------
-- create_audit_event: harden + lock down execute
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_audit_event(
  p_study_id UUID,
  p_actor_id UUID,
  p_action_type TEXT,
  p_target_entity_type TEXT,
  p_target_entity_id UUID,
  p_previous_state_hash TEXT,
  p_new_state_hash TEXT,
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event_id UUID;
  v_actor_role TEXT;
  v_event_id_text TEXT;
  v_jwt_role TEXT := COALESCE((SELECT auth.jwt()) ->> 'role', '');
BEGIN
  IF v_jwt_role <> 'service_role' THEN
    IF (SELECT auth.uid()) IS NULL THEN
      RAISE EXCEPTION 'authentication required';
    END IF;
    IF p_actor_id IS NOT NULL AND p_actor_id IS DISTINCT FROM (SELECT auth.uid()) THEN
      RAISE EXCEPTION 'actor must match authenticated user';
    END IF;
  END IF;

  IF p_actor_id IS NOT NULL AND p_study_id IS NOT NULL THEN
    v_actor_role := public.get_user_study_role(p_actor_id, p_study_id);
  END IF;

  v_event_id := gen_random_uuid();
  v_event_id_text := 'evt_' || encode(v_event_id::text::bytea, 'hex');

  INSERT INTO public.audit_events (
    id, event_id, study_id, actor_id, actor_role_at_time,
    action_type, target_entity_type, target_entity_id,
    previous_state_hash, new_state_hash, metadata
  ) VALUES (
    v_event_id, v_event_id_text, p_study_id, p_actor_id, v_actor_role,
    p_action_type, p_target_entity_type, p_target_entity_id,
    p_previous_state_hash, p_new_state_hash, p_metadata
  );

  RETURN v_event_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_audit_event(
  UUID, UUID, TEXT, TEXT, UUID, TEXT, TEXT, JSONB
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_audit_event(
  UUID, UUID, TEXT, TEXT, UUID, TEXT, TEXT, JSONB
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_audit_event(
  UUID, UUID, TEXT, TEXT, UUID, TEXT, TEXT, JSONB
) TO service_role;

-- ---------------------------------------------------------------------------
-- create_share_access_event: server-only (admin client); not anon-callable
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.create_share_access_event(UUID, INET, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_share_access_event(UUID, INET, TEXT) TO service_role;

-- ---------------------------------------------------------------------------
-- Study capability / membership helpers (RLS + authenticated RPC)
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.is_study_member(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_study_member(UUID, UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.is_study_admin(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_study_admin(UUID, UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.study_user_can_manage_members(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.study_user_can_manage_members(UUID, UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.study_member_can_view(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.study_member_can_view(UUID, UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.is_study_member_can_view(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_study_member_can_view(UUID, UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.study_member_can_share(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.study_member_can_share(UUID, UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.study_user_can_edit_record_drafts(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.study_user_can_edit_record_drafts(UUID, UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.study_user_can_moderate_record_status(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.study_user_can_moderate_record_status(UUID, UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.study_user_can_anchor_records(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.study_user_can_anchor_records(UUID, UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.get_user_study_role(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_user_study_role(UUID, UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.is_study_admin_role_only(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_study_admin_role_only(UUID, UUID) TO authenticated;

-- ---------------------------------------------------------------------------
-- Institution helpers
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.institution_member_is_active(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.institution_member_is_active(UUID, UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.institution_member_is_admin(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.institution_member_is_admin(UUID, UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.institution_invite_pending_for_current_user(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.institution_invite_pending_for_current_user(UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.institution_invite_invitee_matches_auth_user(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.institution_invite_invitee_matches_auth_user(UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.institution_external_collaborator_rows(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.institution_external_collaborator_rows(UUID) TO authenticated;

-- ---------------------------------------------------------------------------
-- Audit engagement helpers
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.audit_engagement_is_active(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.audit_engagement_is_active(UUID, UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.audit_engagement_study_ids_for_user(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.audit_engagement_study_ids_for_user(UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.is_audit_engagement_viewer_of_study(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_audit_engagement_viewer_of_study(UUID, UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.is_audit_engagement_viewer_of_institution(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_audit_engagement_viewer_of_institution(UUID, UUID) TO authenticated;

-- ---------------------------------------------------------------------------
-- Authenticated RPC entry points
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.audit_events_page_for_viewer(
  TIMESTAMPTZ, UUID[], TEXT, TIMESTAMPTZ, UUID, INT
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.audit_events_page_for_viewer(
  TIMESTAMPTZ, UUID[], TEXT, TIMESTAMPTZ, UUID, INT
) TO authenticated;

REVOKE ALL ON FUNCTION public.complete_study_task_after_record(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.complete_study_task_after_record(UUID, UUID) TO authenticated;

-- ---------------------------------------------------------------------------
-- Trigger functions: block direct anon RPC; allow authenticated DML to fire triggers
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.audit_record_change() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.audit_record_change() TO authenticated;

REVOKE ALL ON FUNCTION public.audit_signature_added() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.audit_signature_added() TO authenticated;

REVOKE ALL ON FUNCTION public.enforce_one_study_role_per_user() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.enforce_one_study_role_per_user() TO authenticated;

REVOKE ALL ON FUNCTION public.sync_study_member_from_role_assignment() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sync_study_member_from_role_assignment() TO authenticated;

REVOKE ALL ON FUNCTION public.seed_study_role_definitions_for_new_study() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.seed_study_role_definitions_for_new_study() TO authenticated;
