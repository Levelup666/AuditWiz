-- Studies must belong to an institution; only institution admins may create studies.
-- Closes gap where RLS previously allowed any authenticated user to insert studies.

DROP POLICY IF EXISTS "Authenticated users can create studies" ON public.studies;

CREATE POLICY "Institution admins can create studies"
  ON public.studies FOR INSERT
  WITH CHECK (
    created_by = auth.uid()
    AND institution_id IS NOT NULL
    AND public.institution_member_is_admin(institution_id, auth.uid())
  );

COMMENT ON POLICY "Institution admins can create studies" ON public.studies IS
  'New studies require a non-null institution_id and active institution admin membership.';
