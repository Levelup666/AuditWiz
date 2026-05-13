-- External auditor engagements: time-boxed, read-only audit access scoped to an institution
-- (or specific studies under that institution). Reuses the hashed-token invite primitive so
-- /invite/{rawToken} accepts engagements alongside study + institution invites.
--
-- Integrity rules preserved:
--   * Insert-only audit_events (no UPDATE/DELETE).
--   * Auditors get SELECT-only via additive RLS predicates; they cannot insert/update/delete
--     records, signatures, anchors, members, etc.
--   * Engagement expiration is enforced inside the SQL helpers used by RLS, so /logs and
--     audit export queries fail closed on every request.

-- ---------------------------------------------------------------------------
-- 1. Tables
-- ---------------------------------------------------------------------------
CREATE TABLE public.audit_engagements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
  -- Auditor email is required so external auditors can be invited before they have an account.
  auditor_email TEXT NOT NULL,
  -- Set on accept; until then the engagement is in a pending state.
  auditor_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  scope TEXT NOT NULL CHECK (scope IN ('institution_wide', 'specific_studies')),
  purpose TEXT,
  starts_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  accepted_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  revocation_reason TEXT,
  granted_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  -- SHA-256 hex of bearer token; raw token never stored. /invite/{token} resolves it.
  token_hash TEXT NOT NULL,
  last_sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resend_count INTEGER NOT NULL DEFAULT 0,
  invite_first_opened_at TIMESTAMPTZ,
  expiry_audit_logged_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT audit_engagements_email_required CHECK (auditor_email <> ''),
  CONSTRAINT audit_engagements_window_positive CHECK (expires_at > starts_at)
);

CREATE TABLE public.audit_engagement_studies (
  engagement_id UUID NOT NULL REFERENCES public.audit_engagements(id) ON DELETE CASCADE,
  study_id UUID NOT NULL REFERENCES public.studies(id) ON DELETE CASCADE,
  added_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (engagement_id, study_id)
);

CREATE INDEX idx_audit_engagements_institution
  ON public.audit_engagements(institution_id);
CREATE INDEX idx_audit_engagements_auditor_user
  ON public.audit_engagements(auditor_user_id)
  WHERE auditor_user_id IS NOT NULL;
CREATE INDEX idx_audit_engagements_email_lower
  ON public.audit_engagements(LOWER(auditor_email));
CREATE INDEX idx_audit_engagement_studies_study
  ON public.audit_engagement_studies(study_id);

CREATE UNIQUE INDEX idx_audit_engagements_token_hash
  ON public.audit_engagements(token_hash);

-- At most one open (pending or active) engagement invite per (institution, normalized email).
CREATE UNIQUE INDEX idx_audit_engagements_open_institution_lower_email
  ON public.audit_engagements (institution_id, LOWER(auditor_email))
  WHERE revoked_at IS NULL;

COMMENT ON TABLE public.audit_engagements IS
  'Time-boxed read-only audit grants for external/internal auditors. Active when accepted_at IS NOT NULL, revoked_at IS NULL, and now() within [starts_at, expires_at).';
COMMENT ON TABLE public.audit_engagement_studies IS
  'Specific studies covered when audit_engagements.scope = specific_studies. Empty for institution_wide.';

-- ---------------------------------------------------------------------------
-- 2. Audit events: new action types
-- ---------------------------------------------------------------------------
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
    'blockchain_anchored',
    'invite_created', 'invite_opened', 'invite_accepted', 'invite_rejected', 'invite_expired',
    'invite_resent', 'invite_revoked',
    'study_task_created', 'study_task_updated', 'study_task_cancelled', 'study_task_completed',
    'audit_engagement_granted', 'audit_engagement_accepted', 'audit_engagement_revoked',
    'audit_engagement_extended', 'audit_engagement_expired',
    'audit_engagement_accessed', 'audit_engagement_export'
  ));

-- ---------------------------------------------------------------------------
-- 3. Helper: is the engagement currently usable?
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.audit_engagement_is_active(
  p_engagement_id UUID,
  p_user_id UUID
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.audit_engagements e
    WHERE e.id = p_engagement_id
      AND e.auditor_user_id = p_user_id
      AND e.accepted_at IS NOT NULL
      AND e.revoked_at IS NULL
      AND e.starts_at <= now()
      AND e.expires_at > now()
  );
$$;

-- Studies a user can read via any active engagement (institution_wide expanded).
CREATE OR REPLACE FUNCTION public.audit_engagement_study_ids_for_user(p_user_id UUID)
RETURNS SETOF UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.id
  FROM public.audit_engagements e
  JOIN public.studies s ON s.institution_id = e.institution_id
  WHERE e.auditor_user_id = p_user_id
    AND e.scope = 'institution_wide'
    AND e.accepted_at IS NOT NULL
    AND e.revoked_at IS NULL
    AND e.starts_at <= now()
    AND e.expires_at > now()
  UNION
  SELECT es.study_id
  FROM public.audit_engagements e
  JOIN public.audit_engagement_studies es ON es.engagement_id = e.id
  WHERE e.auditor_user_id = p_user_id
    AND e.scope = 'specific_studies'
    AND e.accepted_at IS NOT NULL
    AND e.revoked_at IS NULL
    AND e.starts_at <= now()
    AND e.expires_at > now();
$$;

-- Predicate used in RLS: this user has an active engagement covering this study.
CREATE OR REPLACE FUNCTION public.is_audit_engagement_viewer_of_study(
  p_study_id UUID,
  p_user_id UUID
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.audit_engagement_study_ids_for_user(p_user_id) sid
    WHERE sid = p_study_id
  );
$$;

-- Predicate used in RLS: this user has any active engagement for this institution.
CREATE OR REPLACE FUNCTION public.is_audit_engagement_viewer_of_institution(
  p_institution_id UUID,
  p_user_id UUID
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.audit_engagements e
    WHERE e.institution_id = p_institution_id
      AND e.auditor_user_id = p_user_id
      AND e.accepted_at IS NOT NULL
      AND e.revoked_at IS NULL
      AND e.starts_at <= now()
      AND e.expires_at > now()
  );
$$;

REVOKE ALL ON FUNCTION public.audit_engagement_is_active(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.audit_engagement_study_ids_for_user(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_audit_engagement_viewer_of_study(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_audit_engagement_viewer_of_institution(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.audit_engagement_is_active(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.audit_engagement_study_ids_for_user(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_audit_engagement_viewer_of_study(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_audit_engagement_viewer_of_institution(UUID, UUID) TO authenticated;

-- ---------------------------------------------------------------------------
-- 4. RLS: audit_engagements
-- ---------------------------------------------------------------------------
ALTER TABLE public.audit_engagements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_engagement_studies ENABLE ROW LEVEL SECURITY;

-- Institution admins manage engagements.
CREATE POLICY "Institution admins manage audit engagements"
  ON public.audit_engagements FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.institution_members im
      WHERE im.institution_id = audit_engagements.institution_id
        AND im.user_id = auth.uid()
        AND im.role = 'admin'
        AND im.revoked_at IS NULL
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.institution_members im
      WHERE im.institution_id = audit_engagements.institution_id
        AND im.user_id = auth.uid()
        AND im.role = 'admin'
        AND im.revoked_at IS NULL
    )
  );

-- Auditor (after accept) can SELECT their own engagement row.
CREATE POLICY "Auditor can view own engagement"
  ON public.audit_engagements FOR SELECT
  USING (
    auditor_user_id = auth.uid()
  );

-- Pending invitee (matched by email, not yet accepted) can SELECT it for the accept flow.
-- Mirrors the existing institution_invites self-view policy.
CREATE POLICY "Invitee can view own pending engagement invite"
  ON public.audit_engagements FOR SELECT
  USING (
    accepted_at IS NULL
    AND revoked_at IS NULL
    AND expires_at > now()
    AND LOWER(auditor_email) = (SELECT LOWER(email) FROM auth.users WHERE id = auth.uid())
  );

-- Invitee can mark it accepted (sets auditor_user_id = self).
CREATE POLICY "Invitee can accept own pending engagement"
  ON public.audit_engagements FOR UPDATE
  USING (
    accepted_at IS NULL
    AND revoked_at IS NULL
    AND expires_at > now()
    AND LOWER(auditor_email) = (SELECT LOWER(email) FROM auth.users WHERE id = auth.uid())
  )
  WITH CHECK (
    auditor_user_id = auth.uid()
  );

-- Studies covered by an engagement: visible to the institution admin AND to the auditor of that engagement.
CREATE POLICY "Institution admins manage engagement studies"
  ON public.audit_engagement_studies FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM public.audit_engagements e
      JOIN public.institution_members im ON im.institution_id = e.institution_id
      WHERE e.id = audit_engagement_studies.engagement_id
        AND im.user_id = auth.uid()
        AND im.role = 'admin'
        AND im.revoked_at IS NULL
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.audit_engagements e
      JOIN public.institution_members im ON im.institution_id = e.institution_id
      WHERE e.id = audit_engagement_studies.engagement_id
        AND im.user_id = auth.uid()
        AND im.role = 'admin'
        AND im.revoked_at IS NULL
    )
  );

CREATE POLICY "Auditor can view their engagement studies"
  ON public.audit_engagement_studies FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.audit_engagements e
      WHERE e.id = audit_engagement_studies.engagement_id
        AND e.auditor_user_id = auth.uid()
        AND e.accepted_at IS NOT NULL
        AND e.revoked_at IS NULL
    )
  );

-- ---------------------------------------------------------------------------
-- 5. Extend read RLS so active auditors get the same SELECTs as study members
--    on the operative tables.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Study members can view audit events" ON public.audit_events;
CREATE POLICY "Study members and engagement auditors can view audit events"
  ON public.audit_events FOR SELECT
  USING (
    study_id IS NULL
    OR public.is_study_member_can_view(study_id, auth.uid())
    OR public.is_audit_engagement_viewer_of_study(study_id, auth.uid())
  );

-- studies: institution members already see studies via existing RLS; engagement auditors
-- need SELECT for the studies they cover.
CREATE POLICY "Engagement auditors can view scoped studies"
  ON public.studies FOR SELECT
  USING (public.is_audit_engagement_viewer_of_study(id, auth.uid()));

-- records (and their downstream): mirror member visibility for auditors. We add an extra
-- ALLOW policy; it does not weaken the existing study-member policy.
CREATE POLICY "Engagement auditors can view records"
  ON public.records FOR SELECT
  USING (public.is_audit_engagement_viewer_of_study(study_id, auth.uid()));

CREATE POLICY "Engagement auditors can view documents"
  ON public.documents FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.records r
      WHERE r.id = documents.record_id
        AND public.is_audit_engagement_viewer_of_study(r.study_id, auth.uid())
    )
  );

CREATE POLICY "Engagement auditors can view signatures"
  ON public.signatures FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.records r
      WHERE r.id = signatures.record_id
        AND public.is_audit_engagement_viewer_of_study(r.study_id, auth.uid())
    )
  );

CREATE POLICY "Engagement auditors can view blockchain anchors"
  ON public.blockchain_anchors FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.records r
      WHERE r.id = blockchain_anchors.record_id
        AND public.is_audit_engagement_viewer_of_study(r.study_id, auth.uid())
    )
  );

-- Institution view: auditors can read the institution row that hosts their engagement.
CREATE POLICY "Engagement auditors can view their institution"
  ON public.institutions FOR SELECT
  USING (public.is_audit_engagement_viewer_of_institution(id, auth.uid()));
