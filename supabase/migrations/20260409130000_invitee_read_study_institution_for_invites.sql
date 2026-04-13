-- Invite detail pages embed parent study/institution rows. RLS previously allowed only
-- members to read those tables, so the embed was empty and the app called notFound().

-- Institution: invitee with JWT email matching a non-revoked invite row for this institution.
CREATE POLICY "Invitees can view institution for own invite"
  ON public.institutions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.institution_invites iv
      WHERE iv.institution_id = institutions.id
        AND iv.revoked_at IS NULL
        AND iv.expires_at > NOW()
        AND iv.email IS NOT NULL
        AND COALESCE((auth.jwt() ->> 'email'), '') <> ''
        AND LOWER(TRIM(iv.email)) = LOWER(TRIM(auth.jwt() ->> 'email'))
        AND (
          iv.accepted_at IS NULL
          OR iv.accepted_by = auth.uid()
        )
    )
  );

COMMENT ON POLICY "Invitees can view institution for own invite" ON public.institutions IS
  'Lets invitees resolve institution:institutions() embed on invite accept pages; scoped to invites they can already read.';

-- Study: same visibility as study_member_invites invitee SELECT policy.
CREATE POLICY "Invitees can view study for matching pending invite"
  ON public.studies FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.study_member_invites smi
      WHERE smi.study_id = studies.id
        AND smi.accepted_at IS NULL
        AND smi.expires_at > NOW()
        AND smi.revoked_at IS NULL
        AND (
          smi.orcid_id IN (
            SELECT provider_id FROM public.user_identities
            WHERE user_id = auth.uid() AND provider = 'orcid' AND revoked_at IS NULL
          )
          OR (
            smi.email IS NOT NULL
            AND COALESCE((auth.jwt() ->> 'email'), '') <> ''
            AND LOWER(TRIM(smi.email)) = LOWER(TRIM(auth.jwt() ->> 'email'))
          )
        )
    )
  );

COMMENT ON POLICY "Invitees can view study for matching pending invite" ON public.studies IS
  'Lets invitees resolve study:studies() embed on invite accept pages; scoped to pending invites they can already read.';
