-- Fix: infinite recursion in RLS on institution_members
-- Policies must not subquery institution_members under the same table's RLS.
-- SECURITY DEFINER helpers read membership without re-entering policies.

CREATE OR REPLACE FUNCTION public.institution_member_is_active(
  p_institution_id uuid,
  p_user_id uuid
)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.institution_members im
    WHERE im.institution_id = p_institution_id
      AND im.user_id = p_user_id
      AND im.revoked_at IS NULL
  );
$$;

CREATE OR REPLACE FUNCTION public.institution_member_is_admin(
  p_institution_id uuid,
  p_user_id uuid
)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.institution_members im
    WHERE im.institution_id = p_institution_id
      AND im.user_id = p_user_id
      AND im.role = 'admin'
      AND im.revoked_at IS NULL
  );
$$;

REVOKE ALL ON FUNCTION public.institution_member_is_active(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.institution_member_is_admin(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.institution_member_is_active(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.institution_member_is_admin(uuid, uuid) TO authenticated;

-- institutions: avoid recursion via institution_members in SELECT; allow creator to see row before first member row exists
DROP POLICY IF EXISTS "Institution members can view institution" ON public.institutions;
DROP POLICY IF EXISTS "Institution admins can update institution" ON public.institutions;

CREATE POLICY "Institution members and creators can view institution"
  ON public.institutions FOR SELECT
  USING (
    created_by = auth.uid()
    OR public.institution_member_is_active(id, auth.uid())
  );

CREATE POLICY "Institution admins can update institution"
  ON public.institutions FOR UPDATE
  USING (public.institution_member_is_admin(id, auth.uid()));

-- institution_members
DROP POLICY IF EXISTS "Institution members can view members" ON public.institution_members;
DROP POLICY IF EXISTS "Institution admins can manage members" ON public.institution_members;
DROP POLICY IF EXISTS "Creators can add self as institution admin" ON public.institution_members;
DROP POLICY IF EXISTS "Users can add self when accepting invite" ON public.institution_members;

CREATE POLICY "Institution members can view members"
  ON public.institution_members FOR SELECT
  USING (public.institution_member_is_active(institution_id, auth.uid()));

CREATE POLICY "Institution admins can manage members"
  ON public.institution_members FOR ALL
  USING (public.institution_member_is_admin(institution_id, auth.uid()))
  WITH CHECK (public.institution_member_is_admin(institution_id, auth.uid()));

CREATE POLICY "Creators can add self as institution admin"
  ON public.institution_members FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND role = 'admin'
    AND EXISTS (
      SELECT 1 FROM public.institutions
      WHERE id = institution_id AND created_by = auth.uid()
    )
  );

CREATE POLICY "Users can add self when accepting invite"
  ON public.institution_members FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.institution_invites
      WHERE institution_id = institution_members.institution_id
        AND LOWER(email) = (SELECT LOWER(email) FROM auth.users WHERE id = auth.uid())
        AND accepted_at IS NOT NULL
        AND accepted_by = auth.uid()
    )
  );

-- institution_invites: admin check must not recurse into institution_members RLS
DROP POLICY IF EXISTS "Institution admins can manage invites" ON public.institution_invites;

CREATE POLICY "Institution admins can manage invites"
  ON public.institution_invites FOR ALL
  USING (public.institution_member_is_admin(institution_id, auth.uid()))
  WITH CHECK (public.institution_member_is_admin(institution_id, auth.uid()));

COMMENT ON FUNCTION public.institution_member_is_active(uuid, uuid) IS 'RLS-safe: active institution membership check without re-entering institution_members policies.';
COMMENT ON FUNCTION public.institution_member_is_admin(uuid, uuid) IS 'RLS-safe: institution admin check without re-entering institution_members policies.';
