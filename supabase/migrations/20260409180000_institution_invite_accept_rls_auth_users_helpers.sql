-- institution_members INSERT policy used EXISTS(SELECT … FROM institution_invites) under the
-- invoker, so invite rows were filtered by invitee SELECT RLS and JWT email claims. Align checks
-- with auth.users (same source as server-side getUser().email) and read invites as table owner
-- inside SECURITY DEFINER helpers (no RLS inside the function body for definer).

CREATE OR REPLACE FUNCTION public.institution_invite_pending_for_current_user(p_institution_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.institution_invites iv
    INNER JOIN auth.users u ON u.id = auth.uid()
    WHERE iv.institution_id = p_institution_id
      AND iv.accepted_at IS NULL
      AND iv.revoked_at IS NULL
      AND iv.expires_at > NOW()
      AND iv.email IS NOT NULL
      AND u.email IS NOT NULL
      AND LOWER(TRIM(iv.email)) = LOWER(TRIM(u.email))
  );
$$;

CREATE OR REPLACE FUNCTION public.institution_invite_invitee_matches_auth_user(p_invite_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.institution_invites iv
    INNER JOIN auth.users u ON u.id = auth.uid()
    WHERE iv.id = p_invite_id
      AND iv.email IS NOT NULL
      AND u.email IS NOT NULL
      AND LOWER(TRIM(iv.email)) = LOWER(TRIM(u.email))
  );
$$;

REVOKE ALL ON FUNCTION public.institution_invite_pending_for_current_user(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.institution_invite_invitee_matches_auth_user(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.institution_invite_pending_for_current_user(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.institution_invite_invitee_matches_auth_user(uuid) TO authenticated;

DROP POLICY IF EXISTS "Users can add self when accepting invite" ON public.institution_members;

CREATE POLICY "Users can add self when accepting invite"
  ON public.institution_members FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND public.institution_invite_pending_for_current_user(institution_members.institution_id)
  );

DROP POLICY IF EXISTS "Invitees can mark own institution invite accepted" ON public.institution_invites;

CREATE POLICY "Invitees can mark own institution invite accepted"
  ON public.institution_invites FOR UPDATE
  USING (
    accepted_at IS NULL
    AND revoked_at IS NULL
    AND expires_at > NOW()
    AND public.institution_invite_invitee_matches_auth_user(institution_invites.id)
  )
  WITH CHECK (
    accepted_at IS NOT NULL
    AND accepted_by = auth.uid()
  );

COMMENT ON FUNCTION public.institution_invite_pending_for_current_user(uuid) IS
  'RLS helper: pending institution invite for auth.uid() at this institution (email via auth.users).';
COMMENT ON FUNCTION public.institution_invite_invitee_matches_auth_user(uuid) IS
  'RLS helper: invite row email matches auth.users email for auth.uid().';
