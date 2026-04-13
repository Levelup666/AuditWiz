-- Study-scoped role definitions, assignments (max 2 active per user per study), capability-based RLS.
-- study_members kept in sync from assignments for legacy row shape; new writes should use assignments + trigger.

-- ---------------------------------------------------------------------------
-- 1. studies.max_members (NULL = use app default from env)
-- ---------------------------------------------------------------------------
ALTER TABLE public.studies
  ADD COLUMN IF NOT EXISTS max_members INTEGER NULL
  CONSTRAINT studies_max_members_positive CHECK (max_members IS NULL OR max_members > 0);

COMMENT ON COLUMN public.studies.max_members IS 'Optional cap on active members; NULL means platform default in application.';

-- ---------------------------------------------------------------------------
-- 2. Role definitions (system + future custom rows)
-- ---------------------------------------------------------------------------
CREATE TABLE public.study_role_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  study_id UUID NOT NULL REFERENCES public.studies(id) ON DELETE CASCADE,
  slug TEXT NOT NULL,
  display_name TEXT NOT NULL,
  is_system BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order INT NOT NULL DEFAULT 0,
  can_view BOOLEAN NOT NULL DEFAULT FALSE,
  can_comment BOOLEAN NOT NULL DEFAULT FALSE,
  can_review BOOLEAN NOT NULL DEFAULT FALSE,
  can_approve BOOLEAN NOT NULL DEFAULT FALSE,
  can_share BOOLEAN NOT NULL DEFAULT FALSE,
  can_manage_members BOOLEAN NOT NULL DEFAULT FALSE,
  can_edit_study_settings BOOLEAN NOT NULL DEFAULT FALSE,
  can_create_records BOOLEAN NOT NULL DEFAULT FALSE,
  can_moderate_record_status BOOLEAN NOT NULL DEFAULT FALSE,
  can_anchor_records BOOLEAN NOT NULL DEFAULT FALSE,
  can_access_audit_hub BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT study_role_definitions_study_slug_unique UNIQUE (study_id, slug)
);

CREATE INDEX idx_study_role_definitions_study_id ON public.study_role_definitions(study_id);

COMMENT ON TABLE public.study_role_definitions IS 'Study-scoped role templates; is_system marks built-in slugs. Custom roles start minimal until flags are set.';

-- ---------------------------------------------------------------------------
-- 3. Assignments
-- ---------------------------------------------------------------------------
CREATE TABLE public.study_member_role_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  study_id UUID NOT NULL REFERENCES public.studies(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role_definition_id UUID NOT NULL REFERENCES public.study_role_definitions(id) ON DELETE RESTRICT,
  granted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at TIMESTAMPTZ NULL
);

CREATE UNIQUE INDEX study_member_role_assignments_active_unique
  ON public.study_member_role_assignments (study_id, user_id, role_definition_id)
  WHERE revoked_at IS NULL;

CREATE INDEX idx_study_member_role_assignments_study_user
  ON public.study_member_role_assignments(study_id, user_id)
  WHERE revoked_at IS NULL;

-- ---------------------------------------------------------------------------
-- 4. study_members: link to definition, relax role text for custom slugs
-- ---------------------------------------------------------------------------
ALTER TABLE public.study_members
  ADD COLUMN IF NOT EXISTS role_definition_id UUID REFERENCES public.study_role_definitions(id) ON DELETE SET NULL;

ALTER TABLE public.study_members
  DROP CONSTRAINT IF EXISTS study_members_role_check;

ALTER TABLE public.study_members
  ADD CONSTRAINT study_members_role_nonempty CHECK (length(trim(role)) > 0);

-- ---------------------------------------------------------------------------
-- 5. Seed built-in definitions for every study
-- ---------------------------------------------------------------------------
INSERT INTO public.study_role_definitions (
  study_id, slug, display_name, is_system, sort_order,
  can_view, can_comment, can_review, can_approve, can_share,
  can_manage_members, can_edit_study_settings, can_create_records,
  can_moderate_record_status, can_anchor_records, can_access_audit_hub
)
SELECT
  s.id,
  v.slug,
  v.display_name,
  TRUE,
  v.sort_order,
  v.can_view, v.can_comment, v.can_review, v.can_approve, v.can_share,
  v.can_manage_members, v.can_edit_study_settings, v.can_create_records,
  v.can_moderate_record_status, v.can_anchor_records, v.can_access_audit_hub
FROM public.studies s
CROSS JOIN (
  VALUES
    -- creator: matches historical is_study_admin including creator + draft edit
    ('creator', 'Creator', 0,
      true, true, false, false, false,
      true, true, true,
      false, false, false),
    ('reviewer', 'Reviewer', 1,
      true, true, true, false, false,
      false, false, false,
      true, false, false),
    ('approver', 'Approver', 2,
      true, true, true, true, true,
      false, false, false,
      true, true, false),
    ('auditor', 'Auditor', 3,
      true, true, true, false, false,
      false, false, false,
      false, false, true),
    ('admin', 'Admin', 4,
      true, true, true, true, true,
      true, true, true,
      true, true, true)
) AS v(
  slug, display_name, sort_order,
  can_view, can_comment, can_review, can_approve, can_share,
  can_manage_members, can_edit_study_settings, can_create_records,
  can_moderate_record_status, can_anchor_records, can_access_audit_hub
)
ON CONFLICT (study_id, slug) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 6. Backfill role_definition_id on existing study_members
-- ---------------------------------------------------------------------------
UPDATE public.study_members sm
SET role_definition_id = d.id
FROM public.study_role_definitions d
WHERE sm.study_id = d.study_id
  AND sm.role = d.slug
  AND sm.role_definition_id IS NULL;

-- ---------------------------------------------------------------------------
-- 7. Replace unique index on study_members (one active row per user per role def)
-- ---------------------------------------------------------------------------
DROP INDEX IF EXISTS idx_study_members_unique_active;

CREATE UNIQUE INDEX study_members_active_study_user_role_def
  ON public.study_members (study_id, user_id, role_definition_id)
  WHERE revoked_at IS NULL AND role_definition_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 8. Backfill assignments from current study_members (before triggers)
-- ---------------------------------------------------------------------------
INSERT INTO public.study_member_role_assignments (
  study_id, user_id, role_definition_id, granted_by, granted_at, revoked_at
)
SELECT
  sm.study_id,
  sm.user_id,
  sm.role_definition_id,
  sm.granted_by,
  sm.granted_at,
  sm.revoked_at
FROM public.study_members sm
WHERE sm.role_definition_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.study_member_role_assignments a
    WHERE a.study_id = sm.study_id
      AND a.user_id = sm.user_id
      AND a.role_definition_id = sm.role_definition_id
      AND (
        (a.revoked_at IS NULL AND sm.revoked_at IS NULL)
        OR (a.revoked_at IS NOT DISTINCT FROM sm.revoked_at)
      )
  );

-- ---------------------------------------------------------------------------
-- 9. Capability helpers (assignments + definitions; SECURITY DEFINER)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_study_member(p_study_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.study_member_role_assignments a
    WHERE a.study_id = p_study_id
      AND a.user_id = p_user_id
      AND a.revoked_at IS NULL
  );
$$;

CREATE OR REPLACE FUNCTION public.study_user_can_manage_members(p_study_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.study_member_role_assignments a
    JOIN public.study_role_definitions d ON d.id = a.role_definition_id
    WHERE a.study_id = p_study_id
      AND a.user_id = p_user_id
      AND a.revoked_at IS NULL
      AND d.can_manage_members = TRUE
  );
$$;

CREATE OR REPLACE FUNCTION public.is_study_admin(p_study_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.study_user_can_manage_members(p_study_id, p_user_id);
$$;

CREATE OR REPLACE FUNCTION public.study_member_can_view(p_study_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.study_member_role_assignments a
    JOIN public.study_role_definitions d ON d.id = a.role_definition_id
    WHERE a.study_id = p_study_id
      AND a.user_id = p_user_id
      AND a.revoked_at IS NULL
      AND d.can_view = TRUE
  );
$$;

CREATE OR REPLACE FUNCTION public.is_study_member_can_view(p_study_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.study_member_can_view(p_study_id, p_user_id);
$$;

CREATE OR REPLACE FUNCTION public.study_member_can_share(p_study_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.study_member_role_assignments a
    JOIN public.study_role_definitions d ON d.id = a.role_definition_id
    WHERE a.study_id = p_study_id
      AND a.user_id = p_user_id
      AND a.revoked_at IS NULL
      AND d.can_share = TRUE
  );
$$;

CREATE OR REPLACE FUNCTION public.study_user_can_edit_record_drafts(p_study_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.study_member_role_assignments a
    JOIN public.study_role_definitions d ON d.id = a.role_definition_id
    WHERE a.study_id = p_study_id
      AND a.user_id = p_user_id
      AND a.revoked_at IS NULL
      AND d.can_create_records = TRUE
  );
$$;

CREATE OR REPLACE FUNCTION public.study_user_can_moderate_record_status(p_study_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.study_member_role_assignments a
    JOIN public.study_role_definitions d ON d.id = a.role_definition_id
    WHERE a.study_id = p_study_id
      AND a.user_id = p_user_id
      AND a.revoked_at IS NULL
      AND d.can_moderate_record_status = TRUE
  );
$$;

CREATE OR REPLACE FUNCTION public.study_user_can_anchor_records(p_study_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.study_member_role_assignments a
    JOIN public.study_role_definitions d ON d.id = a.role_definition_id
    WHERE a.study_id = p_study_id
      AND a.user_id = p_user_id
      AND a.revoked_at IS NULL
      AND d.can_anchor_records = TRUE
  );
$$;

CREATE OR REPLACE FUNCTION public.get_user_study_role(p_user_id UUID, p_study_id UUID)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT string_agg(d.slug, '+' ORDER BY d.sort_order, d.slug)
  FROM public.study_member_role_assignments a
  JOIN public.study_role_definitions d ON d.id = a.role_definition_id
  WHERE a.study_id = p_study_id
    AND a.user_id = p_user_id
    AND a.revoked_at IS NULL;
$$;

-- ---------------------------------------------------------------------------
-- 10. RLS: records + blockchain (replace role IN checks)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Creators can update draft records" ON public.records;
CREATE POLICY "Creators can update draft records"
  ON public.records FOR UPDATE
  USING (
    status = 'draft'
    AND public.study_user_can_edit_record_drafts(study_id, auth.uid())
  )
  WITH CHECK (
    status = 'draft'
    OR status IN ('submitted', 'under_review')
  );

DROP POLICY IF EXISTS "Reviewers and approvers can update record status" ON public.records;
CREATE POLICY "Reviewers and approvers can update record status"
  ON public.records FOR UPDATE
  USING (
    status IN ('submitted', 'under_review')
    AND public.study_user_can_moderate_record_status(study_id, auth.uid())
  )
  WITH CHECK (status IN ('submitted', 'under_review', 'rejected', 'approved', 'amended'));

DROP POLICY IF EXISTS "Approvers and admins can insert blockchain anchors" ON public.blockchain_anchors;
CREATE POLICY "Approvers and admins can insert blockchain anchors"
  ON public.blockchain_anchors FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.records r
      WHERE r.id = blockchain_anchors.record_id
        AND public.study_user_can_anchor_records(r.study_id, auth.uid())
    )
  );

-- ---------------------------------------------------------------------------
-- 11. study_members: inserts come only from assignment sync trigger (SECURITY DEFINER)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Admins can insert study members" ON public.study_members;
DROP POLICY IF EXISTS "Study creator can add self as admin member" ON public.study_members;

-- ---------------------------------------------------------------------------
-- 11b. Admin-only study delete (slug admin, not creator)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_study_admin_role_only(p_study_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.study_member_role_assignments a
    JOIN public.study_role_definitions d ON d.id = a.role_definition_id
    WHERE a.study_id = p_study_id
      AND a.user_id = p_user_id
      AND a.revoked_at IS NULL
      AND d.slug = 'admin'
  );
$$;

-- ---------------------------------------------------------------------------
-- 11c. Documents: capability-based create (creator / admin templates)
-- ---------------------------------------------------------------------------
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

DROP POLICY IF EXISTS "Users can upload documents" ON public.documents;
CREATE POLICY "Users can upload documents"
  ON public.documents FOR INSERT
  WITH CHECK (
    uploaded_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.records r
      WHERE r.id = documents.record_id
        AND public.study_user_can_edit_record_drafts(r.study_id, auth.uid())
    )
  );

-- ---------------------------------------------------------------------------
-- 12. Max two active assignments per study user
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_max_two_study_role_assignments()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cnt INTEGER;
BEGIN
  IF TG_OP = 'INSERT' AND NEW.revoked_at IS NULL THEN
    SELECT COUNT(*) INTO cnt
    FROM public.study_member_role_assignments
    WHERE study_id = NEW.study_id
      AND user_id = NEW.user_id
      AND revoked_at IS NULL;
    IF cnt >= 2 THEN
      RAISE EXCEPTION 'At most two active role assignments per user per study';
    END IF;
  ELSIF TG_OP = 'UPDATE' AND NEW.revoked_at IS NULL AND (OLD.revoked_at IS NOT NULL) THEN
    SELECT COUNT(*) INTO cnt
    FROM public.study_member_role_assignments
    WHERE study_id = NEW.study_id
      AND user_id = NEW.user_id
      AND revoked_at IS NULL
      AND id <> NEW.id;
    IF cnt >= 2 THEN
      RAISE EXCEPTION 'At most two active role assignments per user per study';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_study_role_assignments_max_two
  BEFORE INSERT OR UPDATE ON public.study_member_role_assignments
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_max_two_study_role_assignments();

-- ---------------------------------------------------------------------------
-- 13. Sync assignment -> study_members (SECURITY DEFINER; bypasses RLS)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sync_study_member_from_role_assignment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  def public.study_role_definitions%ROWTYPE;
BEGIN
  IF TG_OP = 'INSERT' AND NEW.revoked_at IS NULL THEN
    SELECT * INTO def FROM public.study_role_definitions WHERE id = NEW.role_definition_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Role definition not found';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.study_members
      WHERE study_id = NEW.study_id
        AND user_id = NEW.user_id
        AND role_definition_id = NEW.role_definition_id
        AND revoked_at IS NULL
    ) THEN
      INSERT INTO public.study_members (
        study_id, user_id, role, granted_by, granted_at,
        can_view, can_comment, can_review, can_approve, can_share,
        role_definition_id
      ) VALUES (
        NEW.study_id,
        NEW.user_id,
        def.slug,
        NEW.granted_by,
        NEW.granted_at,
        def.can_view,
        def.can_comment,
        def.can_review,
        def.can_approve,
        def.can_share,
        NEW.role_definition_id
      );
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' AND NEW.revoked_at IS NOT NULL AND (OLD.revoked_at IS NULL) THEN
    UPDATE public.study_members
    SET revoked_at = NEW.revoked_at
    WHERE study_id = NEW.study_id
      AND user_id = NEW.user_id
      AND role_definition_id = NEW.role_definition_id
      AND revoked_at IS NULL;
    RETURN NEW;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_sync_study_member_from_assignment
  AFTER INSERT OR UPDATE ON public.study_member_role_assignments
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_study_member_from_role_assignment();

-- ---------------------------------------------------------------------------
-- 14. New studies: seed role definitions
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.seed_study_role_definitions_for_new_study()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.study_role_definitions (
    study_id, slug, display_name, is_system, sort_order,
    can_view, can_comment, can_review, can_approve, can_share,
    can_manage_members, can_edit_study_settings, can_create_records,
    can_moderate_record_status, can_anchor_records, can_access_audit_hub
  )
  VALUES
    (NEW.id, 'creator', 'Creator', TRUE, 0,
      true, true, false, false, false,
      true, true, true,
      false, false, false),
    (NEW.id, 'reviewer', 'Reviewer', TRUE, 1,
      true, true, true, false, false,
      false, false, false,
      true, false, false),
    (NEW.id, 'approver', 'Approver', TRUE, 2,
      true, true, true, true, true,
      false, false, false,
      true, true, false),
    (NEW.id, 'auditor', 'Auditor', TRUE, 3,
      true, true, true, false, false,
      false, false, false,
      false, false, true),
    (NEW.id, 'admin', 'Admin', TRUE, 4,
      true, true, true, true, true,
      true, true, true,
      true, true, true)
  ON CONFLICT (study_id, slug) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_seed_study_roles
  AFTER INSERT ON public.studies
  FOR EACH ROW
  EXECUTE FUNCTION public.seed_study_role_definitions_for_new_study();

-- ---------------------------------------------------------------------------
-- 15. RLS on new tables
-- ---------------------------------------------------------------------------
ALTER TABLE public.study_role_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.study_member_role_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Study members can view role definitions"
  ON public.study_role_definitions FOR SELECT
  USING (public.is_study_member(study_id, auth.uid()));

CREATE POLICY "Study admins manage role definitions"
  ON public.study_role_definitions FOR ALL
  USING (public.study_user_can_manage_members(study_id, auth.uid()))
  WITH CHECK (public.study_user_can_manage_members(study_id, auth.uid()));

CREATE POLICY "Study members can view role assignments"
  ON public.study_member_role_assignments FOR SELECT
  USING (public.is_study_member(study_id, auth.uid()));

CREATE POLICY "Study admins manage role assignments"
  ON public.study_member_role_assignments FOR INSERT
  WITH CHECK (
    public.study_user_can_manage_members(study_id, auth.uid())
    OR (
      user_id = auth.uid()
      AND granted_by = auth.uid()
      AND study_id IN (SELECT id FROM public.studies WHERE created_by = auth.uid())
      AND (
        SELECT COUNT(*)::int
        FROM public.study_member_role_assignments a
        WHERE a.study_id = study_id
          AND a.user_id = user_id
          AND a.revoked_at IS NULL
      ) = 0
    )
  );

CREATE POLICY "Study admins update role assignments"
  ON public.study_member_role_assignments FOR UPDATE
  USING (public.study_user_can_manage_members(study_id, auth.uid()))
  WITH CHECK (public.study_user_can_manage_members(study_id, auth.uid()));

-- ---------------------------------------------------------------------------
-- 16. Fix duplicate INSERT policy attempt + grant execute where needed
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.study_user_can_edit_record_drafts(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.study_user_can_moderate_record_status(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.study_user_can_anchor_records(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.study_user_can_manage_members(UUID, UUID) FROM PUBLIC;

GRANT SELECT ON public.study_role_definitions TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.study_member_role_assignments TO authenticated;
