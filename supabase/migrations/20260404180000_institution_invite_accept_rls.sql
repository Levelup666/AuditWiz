-- Invites: invitees had SELECT on pending rows only; only institution admins had UPDATE on
-- institution_invites. The app updated the invite first, which matched 0 rows (no error from PostgREST).
-- institution_members INSERT policy required accepted_at IS NOT NULL on the invite, so EXISTS never
-- held and inserts failed with RLS (42501).
--
-- Fix: (1) INSERT self as member when a matching pending invite exists (JWT email).
--      (2) Allow invitee UPDATE to set accepted_at / accepted_by on their own pending row.

DROP POLICY IF EXISTS "Users can add self when accepting invite" ON public.institution_members;

CREATE POLICY "Users can add self when accepting invite"
  ON public.institution_members FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.institution_invites iv
      WHERE iv.institution_id = institution_members.institution_id
        AND COALESCE((auth.jwt() ->> 'email'), '') <> ''
        AND LOWER(TRIM(iv.email)) = LOWER(TRIM(auth.jwt() ->> 'email'))
        AND iv.accepted_at IS NULL
        AND iv.expires_at > NOW()
        AND iv.revoked_at IS NULL
    )
  );

CREATE POLICY "Invitees can mark own institution invite accepted"
  ON public.institution_invites FOR UPDATE
  USING (
    accepted_at IS NULL
    AND revoked_at IS NULL
    AND expires_at > NOW()
    AND email IS NOT NULL
    AND COALESCE((auth.jwt() ->> 'email'), '') <> ''
    AND LOWER(TRIM(email)) = LOWER(TRIM(auth.jwt() ->> 'email'))
  )
  WITH CHECK (
    accepted_at IS NOT NULL
    AND accepted_by = auth.uid()
  );

COMMENT ON POLICY "Invitees can mark own institution invite accepted" ON public.institution_invites IS
  'Allows JWT-matched invitee to finalize accept after institution_members row is inserted.';
