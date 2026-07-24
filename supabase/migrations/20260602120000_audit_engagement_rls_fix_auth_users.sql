-- Fix: permission denied for table users on audit_engagements SELECT/UPDATE
-- Invitee policies queried auth.users as the authenticated role; Supabase does not grant that.
-- Use SECURITY DEFINER helper (same pattern as institution_invite_invitee_matches_auth_user).

CREATE OR REPLACE FUNCTION public.audit_engagement_invitee_matches_auth_user(p_engagement_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.audit_engagements e
    INNER JOIN auth.users u ON u.id = auth.uid()
    WHERE e.id = p_engagement_id
      AND e.auditor_email IS NOT NULL
      AND u.email IS NOT NULL
      AND LOWER(TRIM(e.auditor_email)) = LOWER(TRIM(u.email))
  );
$$;

CREATE OR REPLACE FUNCTION public.audit_engagement_pending_invitee_for_current_user()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.audit_engagements e
    INNER JOIN auth.users u ON u.id = auth.uid()
    WHERE e.accepted_at IS NULL
      AND e.revoked_at IS NULL
      AND e.expires_at > NOW()
      AND e.auditor_email IS NOT NULL
      AND u.email IS NOT NULL
      AND LOWER(TRIM(e.auditor_email)) = LOWER(TRIM(u.email))
  );
$$;

REVOKE ALL ON FUNCTION public.audit_engagement_invitee_matches_auth_user(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.audit_engagement_pending_invitee_for_current_user() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.audit_engagement_invitee_matches_auth_user(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.audit_engagement_pending_invitee_for_current_user() TO authenticated;

DROP POLICY IF EXISTS "Invitee can view own pending engagement invite" ON public.audit_engagements;
CREATE POLICY "Invitee can view own pending engagement invite"
  ON public.audit_engagements FOR SELECT
  USING (
    accepted_at IS NULL
    AND revoked_at IS NULL
    AND expires_at > now()
    AND public.audit_engagement_invitee_matches_auth_user(audit_engagements.id)
  );

DROP POLICY IF EXISTS "Invitee can accept own pending engagement" ON public.audit_engagements;
CREATE POLICY "Invitee can accept own pending engagement"
  ON public.audit_engagements FOR UPDATE
  USING (
    accepted_at IS NULL
    AND revoked_at IS NULL
    AND expires_at > now()
    AND public.audit_engagement_invitee_matches_auth_user(audit_engagements.id)
  )
  WITH CHECK (
    auditor_user_id = auth.uid()
  );

COMMENT ON FUNCTION public.audit_engagement_invitee_matches_auth_user(uuid) IS
  'RLS helper: engagement auditor_email matches auth.users email for auth.uid() (SECURITY DEFINER).';
COMMENT ON FUNCTION public.audit_engagement_pending_invitee_for_current_user() IS
  'RLS helper: user has any pending audit engagement invite matched by email.';
