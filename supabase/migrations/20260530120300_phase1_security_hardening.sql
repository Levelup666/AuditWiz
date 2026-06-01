-- Phase 1 security hardening:
-- 1) Drop unused legacy views and generate_content_hash
-- 2) Bind audit-engagement RPC helpers to auth.uid() (no caller-supplied user id)
-- 3) Update RLS policies to match new helper signatures

-- ---------------------------------------------------------------------------
-- 1. Legacy objects (unused by application code)
-- ---------------------------------------------------------------------------
DROP VIEW IF EXISTS public.current_study_roles;
DROP VIEW IF EXISTS public.record_version_history;
DROP FUNCTION IF EXISTS public.generate_content_hash(JSONB);

-- ---------------------------------------------------------------------------
-- 2. Drop RLS policies that depend on old engagement helper signatures
--    (required before DROP FUNCTION — Postgres blocks drop while policies reference them)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Study members and engagement auditors can view audit events" ON public.audit_events;
DROP POLICY IF EXISTS "Users can view studies they are permitted to access" ON public.studies;
DROP POLICY IF EXISTS "Users can view institutions they are permitted to access" ON public.institutions;
DROP POLICY IF EXISTS "Users can view records they are permitted to access" ON public.records;
DROP POLICY IF EXISTS "Users can view documents they are permitted to access" ON public.documents;
DROP POLICY IF EXISTS "Users can view signatures they are permitted to access" ON public.signatures;
DROP POLICY IF EXISTS "Users can view blockchain anchors they are permitted to access" ON public.blockchain_anchors;
DROP POLICY IF EXISTS "Engagement auditors can view scoped studies" ON public.studies;
DROP POLICY IF EXISTS "Engagement auditors can view records" ON public.records;
DROP POLICY IF EXISTS "Engagement auditors can view documents" ON public.documents;
DROP POLICY IF EXISTS "Engagement auditors can view signatures" ON public.signatures;
DROP POLICY IF EXISTS "Engagement auditors can view blockchain anchors" ON public.blockchain_anchors;
DROP POLICY IF EXISTS "Engagement auditors can view their institution" ON public.institutions;

-- ---------------------------------------------------------------------------
-- 3. Audit engagement helpers: drop old signatures, recreate auth-scoped
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.is_audit_engagement_viewer_of_study(UUID, UUID);
DROP FUNCTION IF EXISTS public.is_audit_engagement_viewer_of_institution(UUID, UUID);
DROP FUNCTION IF EXISTS public.audit_engagement_study_ids_for_user(UUID);
DROP FUNCTION IF EXISTS public.audit_engagement_is_active(UUID, UUID);

CREATE OR REPLACE FUNCTION public.audit_engagement_study_ids_for_user()
RETURNS SETOF UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.id
  FROM public.audit_engagements e
  JOIN public.studies s ON s.institution_id = e.institution_id
  WHERE e.auditor_user_id = (SELECT auth.uid())
    AND (SELECT auth.uid()) IS NOT NULL
    AND e.scope = 'institution_wide'
    AND e.accepted_at IS NOT NULL
    AND e.revoked_at IS NULL
    AND e.starts_at <= now()
    AND e.expires_at > now()
  UNION
  SELECT es.study_id
  FROM public.audit_engagements e
  JOIN public.audit_engagement_studies es ON es.engagement_id = e.id
  WHERE e.auditor_user_id = (SELECT auth.uid())
    AND (SELECT auth.uid()) IS NOT NULL
    AND e.scope = 'specific_studies'
    AND e.accepted_at IS NOT NULL
    AND e.revoked_at IS NULL
    AND e.starts_at <= now()
    AND e.expires_at > now();
$$;

CREATE OR REPLACE FUNCTION public.is_audit_engagement_viewer_of_study(p_study_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.audit_engagement_study_ids_for_user() sid
    WHERE sid = p_study_id
  );
$$;

CREATE OR REPLACE FUNCTION public.is_audit_engagement_viewer_of_institution(p_institution_id UUID)
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
      AND e.auditor_user_id = (SELECT auth.uid())
      AND (SELECT auth.uid()) IS NOT NULL
      AND e.accepted_at IS NOT NULL
      AND e.revoked_at IS NULL
      AND e.starts_at <= now()
      AND e.expires_at > now()
  );
$$;

CREATE OR REPLACE FUNCTION public.audit_engagement_is_active(p_engagement_id UUID)
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
      AND e.auditor_user_id = (SELECT auth.uid())
      AND (SELECT auth.uid()) IS NOT NULL
      AND e.accepted_at IS NOT NULL
      AND e.revoked_at IS NULL
      AND e.starts_at <= now()
      AND e.expires_at > now()
  );
$$;

COMMENT ON FUNCTION public.audit_engagement_study_ids_for_user() IS
  'Active engagement study ids for auth.uid() only; not callable for other users.';
COMMENT ON FUNCTION public.is_audit_engagement_viewer_of_study(UUID) IS
  'RLS/RPC helper: auth.uid() has an active engagement covering p_study_id.';
COMMENT ON FUNCTION public.is_audit_engagement_viewer_of_institution(UUID) IS
  'RLS helper: auth.uid() has an active engagement for p_institution_id.';
COMMENT ON FUNCTION public.audit_engagement_is_active(UUID) IS
  'RPC helper: engagement p_engagement_id is active for auth.uid().';

REVOKE ALL ON FUNCTION public.audit_engagement_study_ids_for_user() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.audit_engagement_study_ids_for_user() TO authenticated;

REVOKE ALL ON FUNCTION public.is_audit_engagement_viewer_of_study(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_audit_engagement_viewer_of_study(UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.is_audit_engagement_viewer_of_institution(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_audit_engagement_viewer_of_institution(UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.audit_engagement_is_active(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.audit_engagement_is_active(UUID) TO authenticated;

-- ---------------------------------------------------------------------------
-- 4. RLS policies: use auth-scoped engagement helpers (single-arg form)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can view studies they are permitted to access" ON public.studies;
CREATE POLICY "Users can view studies they are permitted to access"
  ON public.studies FOR SELECT
  USING (
    public.is_study_member_can_view(id, (select auth.uid()))
    OR created_by = (select auth.uid())
    OR public.is_audit_engagement_viewer_of_study(id)
    OR EXISTS (
      SELECT 1
      FROM public.study_member_invites smi
      WHERE smi.study_id = studies.id
        AND smi.accepted_at IS NULL
        AND smi.expires_at > NOW()
        AND smi.revoked_at IS NULL
        AND (
          smi.orcid_id IN (
            SELECT ui.provider_id
            FROM public.user_identities ui
            WHERE ui.user_id = (select auth.uid())
              AND ui.provider = 'orcid'
              AND ui.revoked_at IS NULL
          )
          OR (
            smi.email IS NOT NULL
            AND COALESCE(((select auth.jwt()) ->> 'email'), '') <> ''
            AND LOWER(TRIM(smi.email)) = LOWER(TRIM((select auth.jwt()) ->> 'email'))
          )
        )
    )
  );

DROP POLICY IF EXISTS "Users can view institutions they are permitted to access" ON public.institutions;
CREATE POLICY "Users can view institutions they are permitted to access"
  ON public.institutions FOR SELECT
  USING (
    created_by = (select auth.uid())
    OR public.institution_member_is_active(id, (select auth.uid()))
    OR public.is_audit_engagement_viewer_of_institution(id)
    OR EXISTS (
      SELECT 1
      FROM public.institution_invites iv
      WHERE iv.institution_id = institutions.id
        AND iv.revoked_at IS NULL
        AND iv.expires_at > NOW()
        AND iv.email IS NOT NULL
        AND COALESCE(((select auth.jwt()) ->> 'email'), '') <> ''
        AND LOWER(TRIM(iv.email)) = LOWER(TRIM((select auth.jwt()) ->> 'email'))
        AND (
          iv.accepted_at IS NULL
          OR iv.accepted_by = (select auth.uid())
        )
    )
  );

DROP POLICY IF EXISTS "Users can view records they are permitted to access" ON public.records;
CREATE POLICY "Users can view records they are permitted to access"
  ON public.records FOR SELECT
  USING (
    public.is_study_member_can_view(study_id, (select auth.uid()))
    OR public.is_audit_engagement_viewer_of_study(study_id)
  );

DROP POLICY IF EXISTS "Users can view documents they are permitted to access" ON public.documents;
CREATE POLICY "Users can view documents they are permitted to access"
  ON public.documents FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.records r
      WHERE r.id = documents.record_id
        AND (
          public.is_study_member_can_view(r.study_id, (select auth.uid()))
          OR public.is_audit_engagement_viewer_of_study(r.study_id)
        )
    )
  );

DROP POLICY IF EXISTS "Users can view signatures they are permitted to access" ON public.signatures;
CREATE POLICY "Users can view signatures they are permitted to access"
  ON public.signatures FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.records r
      WHERE r.id = signatures.record_id
        AND (
          public.is_study_member_can_view(r.study_id, (select auth.uid()))
          OR public.is_audit_engagement_viewer_of_study(r.study_id)
        )
    )
  );

DROP POLICY IF EXISTS "Users can view blockchain anchors they are permitted to access" ON public.blockchain_anchors;
CREATE POLICY "Users can view blockchain anchors they are permitted to access"
  ON public.blockchain_anchors FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.records r
      WHERE r.id = blockchain_anchors.record_id
        AND (
          public.is_study_member_can_view(r.study_id, (select auth.uid()))
          OR public.is_audit_engagement_viewer_of_study(r.study_id)
        )
    )
  );

-- Audit events (merged member + auditor policy)
DROP POLICY IF EXISTS "Study members and engagement auditors can view audit events" ON public.audit_events;
CREATE POLICY "Study members and engagement auditors can view audit events"
  ON public.audit_events FOR SELECT
  USING (
    study_id IS NULL
    OR public.is_study_member_can_view(study_id, (select auth.uid()))
    OR public.is_audit_engagement_viewer_of_study(study_id)
  );
