-- Permit invitee to read their accepted invite row.
-- Needed for post-update readback and retry flows after acceptance.

DROP POLICY IF EXISTS "Users can view own invites" ON public.institution_invites;

CREATE POLICY "Users can view own invites"
  ON public.institution_invites FOR SELECT
  USING (
    revoked_at IS NULL
    AND expires_at > NOW()
    AND email IS NOT NULL
    AND COALESCE((auth.jwt() ->> 'email'), '') <> ''
    AND LOWER(TRIM(email)) = LOWER(TRIM(auth.jwt() ->> 'email'))
    AND (
      accepted_at IS NULL
      OR accepted_by = auth.uid()
    )
  );
