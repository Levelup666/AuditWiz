-- ORCID Identity Expansion & Structured Collaboration
-- Extends schema with: profiles, user_identities, study member permissions,
-- invite-by-ORCID, verified read-only sharing, and new audit action types.
-- Preserves: append-only audit, immutable records, study-scoped RBAC.

-- ============================================================================
-- 1. PROFILES (extends user identity for display and ORCID)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  orcid_id TEXT,
  orcid_verified BOOLEAN NOT NULL DEFAULT FALSE,
  orcid_affiliation_snapshot TEXT,
  display_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_profiles_orcid_id ON public.profiles(orcid_id) WHERE orcid_id IS NOT NULL;

COMMENT ON TABLE public.profiles IS 'User profile and ORCID identity. orcid_id immutable once set; only one ORCID per user.';

-- ============================================================================
-- 2. USER_IDENTITIES (provider-linked identities; one ORCID per user)
-- ============================================================================
CREATE TABLE public.user_identities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  verified BOOLEAN NOT NULL DEFAULT FALSE,
  linked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ,
  UNIQUE(provider, provider_id)
);

-- One active ORCID per user
CREATE UNIQUE INDEX idx_user_identities_one_orcid_per_user
  ON public.user_identities(user_id)
  WHERE provider = 'orcid' AND revoked_at IS NULL;

CREATE INDEX idx_user_identities_user_id ON public.user_identities(user_id);
CREATE INDEX idx_user_identities_provider ON public.user_identities(provider, provider_id);

COMMENT ON TABLE public.user_identities IS 'External identities (e.g. ORCID). At most one active ORCID per user.';

-- ============================================================================
-- 3. AUDIT EVENTS: extend action_type (drop + recreate check)
-- ============================================================================
ALTER TABLE public.audit_events
  DROP CONSTRAINT IF EXISTS audit_events_action_type_check;

ALTER TABLE public.audit_events
  ADD CONSTRAINT audit_events_action_type_check
  CHECK (action_type IN (
    'study_created', 'study_updated', 'study_deleted',
    'member_added', 'member_removed', 'member_role_changed',
    'study_member_invited', 'study_member_joined',
    'record_created', 'record_submitted', 'record_amended', 'record_rejected', 'record_approved',
    'document_uploaded', 'document_deleted',
    'signature_added', 'signature_revoked',
    'identity_linked',
    'share_created', 'share_accessed',
    'ai_action', 'system_action',
    'blockchain_anchored'
  ));

-- ============================================================================
-- 4. STUDY_MEMBERS: permission flags (study-scoped visibility controls)
-- ============================================================================
ALTER TABLE public.study_members
  ADD COLUMN IF NOT EXISTS can_view BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS can_comment BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS can_review BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS can_approve BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS can_share BOOLEAN NOT NULL DEFAULT FALSE;

-- Backfill existing rows: review/approve/share from role (can_view/can_comment already true)
UPDATE public.study_members
SET
  can_review = (role IN ('reviewer', 'approver', 'auditor', 'admin')),
  can_approve = (role IN ('approver', 'admin')),
  can_share = (role IN ('approver', 'admin'));

COMMENT ON COLUMN public.study_members.can_view IS 'Study-scoped: may view study and records';
COMMENT ON COLUMN public.study_members.can_share IS 'Study-scoped: may create read-only share links';

-- ============================================================================
-- 5. STUDY_MEMBER_INVITES (pending invites by ORCID or email)
-- ============================================================================
CREATE TABLE public.study_member_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  study_id UUID NOT NULL REFERENCES public.studies(id) ON DELETE CASCADE,
  orcid_id TEXT,
  email TEXT,
  role TEXT NOT NULL CHECK (role IN ('creator', 'reviewer', 'approver', 'auditor', 'admin')),
  invited_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  invited_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  accepted_at TIMESTAMPTZ,
  accepted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT study_member_invites_orcid_or_email CHECK (
    (orcid_id IS NOT NULL AND orcid_id <> '') OR (email IS NOT NULL AND email <> '')
  )
);

CREATE INDEX idx_study_member_invites_study ON public.study_member_invites(study_id);
CREATE INDEX idx_study_member_invites_orcid ON public.study_member_invites(orcid_id) WHERE orcid_id IS NOT NULL;
CREATE INDEX idx_study_member_invites_email ON public.study_member_invites(LOWER(email)) WHERE email IS NOT NULL;

COMMENT ON TABLE public.study_member_invites IS 'Pending study invites. ORCID invites require matching ORCID login to accept.';

-- ============================================================================
-- 6. SHARED_ARTIFACTS (read-only sharing; token hash stored, no re-share)
-- ============================================================================
CREATE TABLE public.shared_artifacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  record_version_id UUID NOT NULL REFERENCES public.records(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  permission_level TEXT NOT NULL DEFAULT 'read' CHECK (permission_level = 'read'),
  expires_at TIMESTAMPTZ NOT NULL,
  access_token_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_shared_artifacts_record ON public.shared_artifacts(record_version_id);
CREATE INDEX idx_shared_artifacts_created_by ON public.shared_artifacts(created_by);
-- Index on expires_at for cleanup and listing; predicate omitted (NOW() is not IMMUTABLE)
CREATE INDEX idx_shared_artifacts_expires ON public.shared_artifacts(expires_at);

COMMENT ON TABLE public.shared_artifacts IS 'Read-only share links. No editing, re-sharing, or amendment access.';

-- ============================================================================
-- 7. SHARE_ACCESS_EVENTS (append-only log of share access)
-- ============================================================================
CREATE TABLE public.share_access_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shared_artifact_id UUID NOT NULL REFERENCES public.shared_artifacts(id) ON DELETE CASCADE,
  accessed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ip_address INET,
  user_agent TEXT,
  metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX idx_share_access_events_artifact ON public.share_access_events(shared_artifact_id);

COMMENT ON TABLE public.share_access_events IS 'Append-only log of share link access.';

-- ============================================================================
-- RLS: PROFILES
-- ============================================================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT
  USING (id = auth.uid());

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (id = auth.uid());

-- Insert profile on signup can be done by trigger or app; allow own insert
CREATE POLICY "Users can insert own profile"
  ON public.profiles FOR INSERT
  WITH CHECK (id = auth.uid());

-- ============================================================================
-- RLS: USER_IDENTITIES
-- ============================================================================
ALTER TABLE public.user_identities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own identities"
  ON public.user_identities FOR SELECT
  USING (user_id = auth.uid());

-- Only app/backend should insert/update (ORCID link flow); restrict to own user
CREATE POLICY "Users can insert own identity"
  ON public.user_identities FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can revoke own identity"
  ON public.user_identities FOR UPDATE
  USING (user_id = auth.uid());

-- ============================================================================
-- RLS: STUDY_MEMBER_INVITES (study admins manage; invitee can read own)
-- ============================================================================
ALTER TABLE public.study_member_invites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Study admins can manage invites"
  ON public.study_member_invites FOR ALL
  USING (public.is_study_admin(study_id, auth.uid()));

-- Allow reading invite by token in share flow via API (no direct SELECT by invitee in RLS for anonymous link)
-- For "accept invite" flow, user is authenticated; we need to allow reading invites where orcid_id or email matches.
CREATE POLICY "Users can view invites for their ORCID or email"
  ON public.study_member_invites FOR SELECT
  USING (
    accepted_at IS NULL
    AND expires_at > NOW()
    AND (
      orcid_id IN (SELECT provider_id FROM public.user_identities WHERE user_id = auth.uid() AND provider = 'orcid' AND revoked_at IS NULL)
      OR LOWER(email) = (SELECT LOWER(email) FROM auth.users WHERE id = auth.uid())
    )
  );

-- ============================================================================
-- RLS: SHARED_ARTIFACTS (creator can manage; readers use token validation in API)
-- ============================================================================
ALTER TABLE public.shared_artifacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Creators can view own shared artifacts"
  ON public.shared_artifacts FOR SELECT
  USING (created_by = auth.uid());

CREATE POLICY "Creators can insert shared artifacts"
  ON public.shared_artifacts FOR INSERT
  WITH CHECK (created_by = auth.uid());

-- No UPDATE/DELETE policy: share links are immutable once created (or add DELETE for created_by only if you want revoke)
CREATE POLICY "Creators can delete own shared artifacts"
  ON public.shared_artifacts FOR DELETE
  USING (created_by = auth.uid());

-- ============================================================================
-- RLS: SHARE_ACCESS_EVENTS (insert-only by service; read by artifact creator)
-- ============================================================================
ALTER TABLE public.share_access_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Artifact creators can view access events"
  ON public.share_access_events FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.shared_artifacts sa
      WHERE sa.id = share_access_events.shared_artifact_id AND sa.created_by = auth.uid()
    )
  );

-- No INSERT policy: only create_share_access_event() (SECURITY DEFINER) inserts, so unauthenticated share view can log access.
CREATE OR REPLACE FUNCTION public.create_share_access_event(
  p_shared_artifact_id UUID,
  p_ip_address INET DEFAULT NULL,
  p_user_agent TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO public.share_access_events (shared_artifact_id, ip_address, user_agent)
  VALUES (p_shared_artifact_id, p_ip_address, p_user_agent)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- ============================================================================
-- HELPER: Check permission flags on study_members (for RLS / API)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.study_member_can_view(p_study_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.study_members
    WHERE study_id = p_study_id AND user_id = p_user_id AND revoked_at IS NULL AND can_view = TRUE
  );
$$;

CREATE OR REPLACE FUNCTION public.study_member_can_share(p_study_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.study_members
    WHERE study_id = p_study_id AND user_id = p_user_id AND revoked_at IS NULL AND can_share = TRUE
  );
$$;

-- Helper for RLS: member with can_view (avoids recursion like is_study_member)
CREATE OR REPLACE FUNCTION public.is_study_member_can_view(p_study_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.study_members
    WHERE study_id = p_study_id AND user_id = p_user_id AND revoked_at IS NULL AND can_view = TRUE
  );
$$;

-- ============================================================================
-- RLS: Update study/record visibility to respect can_view
-- ============================================================================
DROP POLICY IF EXISTS "Users can view studies they are members of" ON public.studies;
CREATE POLICY "Users can view studies they are members of"
  ON public.studies FOR SELECT
  USING (
    public.is_study_member_can_view(id, auth.uid()) OR created_by = auth.uid()
  );

DROP POLICY IF EXISTS "Users can view records in their studies" ON public.records;
CREATE POLICY "Users can view records in their studies"
  ON public.records FOR SELECT
  USING (public.is_study_member_can_view(study_id, auth.uid()));

DROP POLICY IF EXISTS "Users can view documents for records they can access" ON public.documents;
CREATE POLICY "Users can view documents for records they can access"
  ON public.documents FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.records r
      WHERE r.id = documents.record_id
        AND public.is_study_member_can_view(r.study_id, auth.uid())
    )
  );

DROP POLICY IF EXISTS "Users can view signatures" ON public.signatures;
CREATE POLICY "Users can view signatures"
  ON public.signatures FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.records r
      WHERE r.id = signatures.record_id
        AND public.is_study_member_can_view(r.study_id, auth.uid())
    )
  );

DROP POLICY IF EXISTS "Study members can view audit events" ON public.audit_events;
CREATE POLICY "Study members can view audit events"
  ON public.audit_events FOR SELECT
  USING (
    study_id IS NULL
    OR public.is_study_member_can_view(study_id, auth.uid())
  );

DROP POLICY IF EXISTS "Users can view blockchain anchors" ON public.blockchain_anchors;
CREATE POLICY "Users can view blockchain anchors"
  ON public.blockchain_anchors FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.records r
      WHERE r.id = blockchain_anchors.record_id
        AND public.is_study_member_can_view(r.study_id, auth.uid())
    )
  );

-- Study members: allow admins to insert new members (invite flow)
CREATE POLICY "Admins can insert study members"
  ON public.study_members FOR INSERT
  WITH CHECK (public.is_study_admin(study_id, auth.uid()));

-- ============================================================================
-- TRIGGER: profiles.updated_at
-- ============================================================================
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
