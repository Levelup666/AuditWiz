-- List study members under an institution who are not active institution members ("external collaborators").
-- Callable only when the current user is an institution admin (returns no rows otherwise).

CREATE OR REPLACE FUNCTION public.institution_external_collaborator_rows(p_institution_id uuid)
RETURNS TABLE (
  study_id uuid,
  study_title text,
  study_member_id uuid,
  user_id uuid
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.id, s.title::text, sm.id, sm.user_id
  FROM public.study_members sm
  INNER JOIN public.studies s
    ON s.id = sm.study_id
    AND s.institution_id = p_institution_id
  LEFT JOIN public.institution_members im
    ON im.institution_id = p_institution_id
    AND im.user_id = sm.user_id
    AND im.revoked_at IS NULL
  WHERE sm.revoked_at IS NULL
    AND im.id IS NULL
    AND public.institution_member_is_admin(p_institution_id, auth.uid());
$$;

REVOKE ALL ON FUNCTION public.institution_external_collaborator_rows(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.institution_external_collaborator_rows(uuid) TO authenticated;

COMMENT ON FUNCTION public.institution_external_collaborator_rows(uuid) IS
  'Institution admins: rows are active study members in org studies who are not institution members. Empty if caller is not admin.';
