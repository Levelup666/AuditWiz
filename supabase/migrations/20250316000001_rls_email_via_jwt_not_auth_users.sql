-- Fix: permission denied for table users
-- RLS policies must not SELECT from auth.users as the authenticated role — Supabase does not grant that.
-- Use JWT email claim (auth.jwt() ->> 'email') for invitee email matching instead.

-- institution_members: accept-invite policy (evaluated on every INSERT; subquery on auth.users failed)
DROP POLICY IF EXISTS "Users can add self when accepting invite" ON public.institution_members;
CREATE POLICY "Users can add self when accepting invite"
  ON public.institution_members FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.institution_invites
      WHERE institution_id = institution_members.institution_id
        AND COALESCE((auth.jwt() ->> 'email'), '') <> ''
        AND LOWER(TRIM(email)) = LOWER(TRIM(auth.jwt() ->> 'email'))
        AND accepted_at IS NOT NULL
        AND accepted_by = auth.uid()
    )
  );

-- institution_invites: invitee read own pending invites
DROP POLICY IF EXISTS "Users can view own invites" ON public.institution_invites;
CREATE POLICY "Users can view own invites"
  ON public.institution_invites FOR SELECT
  USING (
    accepted_at IS NULL
    AND expires_at > NOW()
    AND email IS NOT NULL
    AND COALESCE((auth.jwt() ->> 'email'), '') <> ''
    AND LOWER(TRIM(email)) = LOWER(TRIM(auth.jwt() ->> 'email'))
  );

-- study_member_invites: same pattern for email branch
DROP POLICY IF EXISTS "Users can view invites for their ORCID or email" ON public.study_member_invites;
CREATE POLICY "Users can view invites for their ORCID or email"
  ON public.study_member_invites FOR SELECT
  USING (
    accepted_at IS NULL
    AND expires_at > NOW()
    AND (
      orcid_id IN (
        SELECT provider_id FROM public.user_identities
        WHERE user_id = auth.uid() AND provider = 'orcid' AND revoked_at IS NULL
      )
      OR (
        email IS NOT NULL
        AND COALESCE((auth.jwt() ->> 'email'), '') <> ''
        AND LOWER(TRIM(email)) = LOWER(TRIM(auth.jwt() ->> 'email'))
      )
    )
  );

COMMENT ON POLICY "Users can add self when accepting invite" ON public.institution_members IS
  'Email match uses auth.jwt() claim; do not query auth.users from RLS.';
