-- At most one open (pending) study invite per study and email (case-insensitive).
CREATE UNIQUE INDEX IF NOT EXISTS idx_study_member_invites_open_study_lower_email
  ON public.study_member_invites (study_id, lower(trim(email)))
  WHERE accepted_at IS NULL
    AND revoked_at IS NULL
    AND email IS NOT NULL;

COMMENT ON INDEX public.idx_study_member_invites_open_study_lower_email IS
  'Prevents duplicate pending email invites to the same study.';
