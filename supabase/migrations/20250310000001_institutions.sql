-- Institutions and Onboarding
-- Adds institutions as top-level organizational unit; institution_members; institution_invites

-- ============================================================================
-- 1. INSTITUTIONS TABLE
-- ============================================================================
CREATE TABLE public.institutions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  domain TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_institutions_slug ON public.institutions(slug);
CREATE INDEX idx_institutions_created_by ON public.institutions(created_by);

COMMENT ON TABLE public.institutions IS 'Top-level organizational unit. Studies belong to institutions.';

-- ============================================================================
-- 2. INSTITUTION_MEMBERS TABLE
-- ============================================================================
CREATE TABLE public.institution_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('admin', 'member')),
  granted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ,
  UNIQUE(institution_id, user_id)
);

CREATE UNIQUE INDEX idx_institution_members_unique_active
  ON public.institution_members(institution_id, user_id)
  WHERE revoked_at IS NULL;

CREATE INDEX idx_institution_members_institution ON public.institution_members(institution_id);
CREATE INDEX idx_institution_members_user ON public.institution_members(user_id);

COMMENT ON TABLE public.institution_members IS 'Users belonging to an institution. Admins can manage institution and invite.';

-- ============================================================================
-- 3. INSTITUTION_INVITES TABLE
-- ============================================================================
CREATE TABLE public.institution_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  orcid_id TEXT,
  role TEXT NOT NULL CHECK (role IN ('admin', 'member')),
  invited_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  invited_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  accepted_at TIMESTAMPTZ,
  accepted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT institution_invites_email_required CHECK (email IS NOT NULL AND email <> '')
);

CREATE INDEX idx_institution_invites_institution ON public.institution_invites(institution_id);
CREATE INDEX idx_institution_invites_email ON public.institution_invites(LOWER(email)) WHERE email IS NOT NULL;
CREATE INDEX idx_institution_invites_orcid ON public.institution_invites(orcid_id) WHERE orcid_id IS NOT NULL;

COMMENT ON TABLE public.institution_invites IS 'Pending invites to join an institution.';

-- ============================================================================
-- 4. STUDIES: Add institution_id (nullable for backward compatibility)
-- ============================================================================
ALTER TABLE public.studies
  ADD COLUMN institution_id UUID REFERENCES public.institutions(id) ON DELETE CASCADE;

CREATE INDEX idx_studies_institution ON public.studies(institution_id) WHERE institution_id IS NOT NULL;

-- ============================================================================
-- 5. AUDIT EVENTS: Add institution action types
-- ============================================================================
ALTER TABLE public.audit_events
  DROP CONSTRAINT IF EXISTS audit_events_action_type_check;

ALTER TABLE public.audit_events
  ADD CONSTRAINT audit_events_action_type_check
  CHECK (action_type IN (
    'study_created', 'study_updated', 'study_deleted',
    'member_added', 'member_removed', 'member_role_changed',
    'study_member_invited', 'study_member_joined',
    'institution_created', 'institution_updated', 'institution_deleted',
    'institution_member_added', 'institution_member_removed', 'institution_member_role_changed',
    'institution_member_invited', 'institution_member_joined',
    'record_created', 'record_submitted', 'record_amended', 'record_rejected', 'record_approved',
    'record_draft_updated', 'record_deleted',
    'document_uploaded', 'document_deleted',
    'signature_added', 'signature_revoked',
    'identity_linked',
    'share_created', 'share_accessed',
    'ai_action', 'system_action',
    'blockchain_anchored'
  ));

-- ============================================================================
-- 6. RLS: INSTITUTIONS
-- ============================================================================
ALTER TABLE public.institutions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Institution members can view institution"
  ON public.institutions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.institution_members
      WHERE institution_id = institutions.id
        AND user_id = auth.uid()
        AND revoked_at IS NULL
    )
  );

CREATE POLICY "Institution admins can update institution"
  ON public.institutions FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.institution_members
      WHERE institution_id = institutions.id
        AND user_id = auth.uid()
        AND role = 'admin'
        AND revoked_at IS NULL
    )
  );

CREATE POLICY "Authenticated users can create institution"
  ON public.institutions FOR INSERT
  WITH CHECK (created_by = auth.uid());

-- ============================================================================
-- 7. RLS: INSTITUTION_MEMBERS
-- ============================================================================
ALTER TABLE public.institution_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Institution members can view members"
  ON public.institution_members FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.institution_members im
      WHERE im.institution_id = institution_members.institution_id
        AND im.user_id = auth.uid()
        AND im.revoked_at IS NULL
    )
  );

CREATE POLICY "Institution admins can manage members"
  ON public.institution_members FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.institution_members im
      WHERE im.institution_id = institution_members.institution_id
        AND im.user_id = auth.uid()
        AND im.role = 'admin'
        AND im.revoked_at IS NULL
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.institution_members im
      WHERE im.institution_id = institution_members.institution_id
        AND im.user_id = auth.uid()
        AND im.role = 'admin'
        AND im.revoked_at IS NULL
    )
  );

-- Creator can add self as admin when creating institution
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

-- User can add self when accepting an institution invite
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

-- ============================================================================
-- 8. RLS: INSTITUTION_INVITES
-- ============================================================================
ALTER TABLE public.institution_invites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Institution admins can manage invites"
  ON public.institution_invites FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.institution_members
      WHERE institution_id = institution_invites.institution_id
        AND user_id = auth.uid()
        AND role = 'admin'
        AND revoked_at IS NULL
    )
  );

-- Users can view invites sent to their email
CREATE POLICY "Users can view own invites"
  ON public.institution_invites FOR SELECT
  USING (
    accepted_at IS NULL
    AND expires_at > NOW()
    AND email IS NOT NULL
    AND LOWER(email) = (SELECT LOWER(email) FROM auth.users WHERE id = auth.uid())
  );
