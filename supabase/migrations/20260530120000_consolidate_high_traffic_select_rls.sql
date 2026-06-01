-- Consolidate overlapping permissive SELECT policies on high-traffic tables.
-- Semantics unchanged: former OR of member / invitee / engagement-auditor paths.
-- Uses (select auth.uid()) / (select auth.jwt()) per Supabase RLS performance guidance.

-- ---------------------------------------------------------------------------
-- studies
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can view studies they are members of" ON public.studies;
DROP POLICY IF EXISTS "Invitees can view study for matching pending invite" ON public.studies;
DROP POLICY IF EXISTS "Engagement auditors can view scoped studies" ON public.studies;

CREATE POLICY "Users can view studies they are permitted to access"
  ON public.studies FOR SELECT
  USING (
    public.is_study_member_can_view(id, (select auth.uid()))
    OR created_by = (select auth.uid())
    OR public.is_audit_engagement_viewer_of_study(id, (select auth.uid()))
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

COMMENT ON POLICY "Users can view studies they are permitted to access" ON public.studies IS
  'Study members, creators, pending invitees (ORCID/email), and active audit-engagement auditors.';

-- ---------------------------------------------------------------------------
-- institutions
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Institution members and creators can view institution" ON public.institutions;
DROP POLICY IF EXISTS "Invitees can view institution for own invite" ON public.institutions;
DROP POLICY IF EXISTS "Engagement auditors can view their institution" ON public.institutions;

CREATE POLICY "Users can view institutions they are permitted to access"
  ON public.institutions FOR SELECT
  USING (
    created_by = (select auth.uid())
    OR public.institution_member_is_active(id, (select auth.uid()))
    OR public.is_audit_engagement_viewer_of_institution(id, (select auth.uid()))
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

COMMENT ON POLICY "Users can view institutions they are permitted to access" ON public.institutions IS
  'Institution members, creators, pending invitees (email), and active audit-engagement auditors.';

-- ---------------------------------------------------------------------------
-- records
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can view records in their studies" ON public.records;
DROP POLICY IF EXISTS "Engagement auditors can view records" ON public.records;

CREATE POLICY "Users can view records they are permitted to access"
  ON public.records FOR SELECT
  USING (
    public.is_study_member_can_view(study_id, (select auth.uid()))
    OR public.is_audit_engagement_viewer_of_study(study_id, (select auth.uid()))
  );

COMMENT ON POLICY "Users can view records they are permitted to access" ON public.records IS
  'Study members with can_view and active audit-engagement auditors for scoped studies.';

-- ---------------------------------------------------------------------------
-- documents
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can view documents for records they can access" ON public.documents;
DROP POLICY IF EXISTS "Engagement auditors can view documents" ON public.documents;

CREATE POLICY "Users can view documents they are permitted to access"
  ON public.documents FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.records r
      WHERE r.id = documents.record_id
        AND (
          public.is_study_member_can_view(r.study_id, (select auth.uid()))
          OR public.is_audit_engagement_viewer_of_study(r.study_id, (select auth.uid()))
        )
    )
  );

COMMENT ON POLICY "Users can view documents they are permitted to access" ON public.documents IS
  'Documents for records visible to study members or audit-engagement auditors.';

-- ---------------------------------------------------------------------------
-- signatures
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can view signatures" ON public.signatures;
DROP POLICY IF EXISTS "Engagement auditors can view signatures" ON public.signatures;

CREATE POLICY "Users can view signatures they are permitted to access"
  ON public.signatures FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.records r
      WHERE r.id = signatures.record_id
        AND (
          public.is_study_member_can_view(r.study_id, (select auth.uid()))
          OR public.is_audit_engagement_viewer_of_study(r.study_id, (select auth.uid()))
        )
    )
  );

COMMENT ON POLICY "Users can view signatures they are permitted to access" ON public.signatures IS
  'Signatures for records visible to study members or audit-engagement auditors.';

-- ---------------------------------------------------------------------------
-- blockchain_anchors
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can view blockchain anchors" ON public.blockchain_anchors;
DROP POLICY IF EXISTS "Engagement auditors can view blockchain anchors" ON public.blockchain_anchors;

CREATE POLICY "Users can view blockchain anchors they are permitted to access"
  ON public.blockchain_anchors FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.records r
      WHERE r.id = blockchain_anchors.record_id
        AND (
          public.is_study_member_can_view(r.study_id, (select auth.uid()))
          OR public.is_audit_engagement_viewer_of_study(r.study_id, (select auth.uid()))
        )
    )
  );

COMMENT ON POLICY "Users can view blockchain anchors they are permitted to access" ON public.blockchain_anchors IS
  'Anchors for records visible to study members or audit-engagement auditors.';
