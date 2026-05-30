-- Consolidate study creator into admin; add baseline member role; update seed trigger.

-- ---------------------------------------------------------------------------
-- 1. Add member role to existing studies
-- ---------------------------------------------------------------------------
INSERT INTO public.study_role_definitions (
  study_id, slug, display_name, is_system, sort_order,
  can_view, can_comment, can_review, can_approve, can_share,
  can_manage_members, can_edit_study_settings, can_create_records,
  can_moderate_record_status, can_anchor_records, can_access_audit_hub
)
SELECT
  s.id,
  'member',
  'Member',
  TRUE,
  1,
  true, true, false, false, false,
  false, false, true,
  false, false, false
FROM public.studies s
WHERE NOT EXISTS (
  SELECT 1 FROM public.study_role_definitions d
  WHERE d.study_id = s.id AND d.slug = 'member'
);

-- Reorder system role pickers: member, reviewer, approver, auditor, admin
UPDATE public.study_role_definitions SET sort_order = 1 WHERE slug = 'member';
UPDATE public.study_role_definitions SET sort_order = 2 WHERE slug = 'reviewer';
UPDATE public.study_role_definitions SET sort_order = 3 WHERE slug = 'approver';
UPDATE public.study_role_definitions SET sort_order = 4 WHERE slug = 'auditor';
UPDATE public.study_role_definitions SET sort_order = 5 WHERE slug = 'admin';
UPDATE public.study_role_definitions SET sort_order = 99 WHERE slug = 'creator';

UPDATE public.study_role_definitions
SET display_name = 'Creator (deprecated)'
WHERE slug = 'creator';

-- ---------------------------------------------------------------------------
-- 2. Migrate active creator assignments -> admin (or revoke if admin exists)
-- ---------------------------------------------------------------------------
UPDATE public.study_member_role_assignments a
SET revoked_at = now()
FROM public.study_role_definitions d_creator
JOIN public.study_role_definitions d_admin
  ON d_admin.study_id = d_creator.study_id AND d_admin.slug = 'admin'
WHERE a.role_definition_id = d_creator.id
  AND d_creator.slug = 'creator'
  AND a.revoked_at IS NULL
  AND EXISTS (
    SELECT 1
    FROM public.study_member_role_assignments a2
    WHERE a2.study_id = a.study_id
      AND a2.user_id = a.user_id
      AND a2.role_definition_id = d_admin.id
      AND a2.revoked_at IS NULL
  );

UPDATE public.study_member_role_assignments a
SET role_definition_id = d_admin.id
FROM public.study_role_definitions d_creator
JOIN public.study_role_definitions d_admin
  ON d_admin.study_id = d_creator.study_id AND d_admin.slug = 'admin'
WHERE a.role_definition_id = d_creator.id
  AND d_creator.slug = 'creator'
  AND a.revoked_at IS NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.study_member_role_assignments a2
    WHERE a2.study_id = a.study_id
      AND a2.user_id = a.user_id
      AND a2.role_definition_id = d_admin.id
      AND a2.revoked_at IS NULL
  );

-- Sync study_members rows still pointing at creator slug
UPDATE public.study_members sm
SET
  role = d_admin.slug,
  role_definition_id = d_admin.id,
  can_view = d_admin.can_view,
  can_comment = d_admin.can_comment,
  can_review = d_admin.can_review,
  can_approve = d_admin.can_approve,
  can_share = d_admin.can_share
FROM public.study_role_definitions d_admin
WHERE sm.role = 'creator'
  AND sm.revoked_at IS NULL
  AND d_admin.study_id = sm.study_id
  AND d_admin.slug = 'admin';

-- Pending invites: creator -> admin
UPDATE public.study_member_invites
SET role = 'admin'
WHERE role = 'creator'
  AND accepted_at IS NULL
  AND revoked_at IS NULL;

ALTER TABLE public.study_member_invites
  DROP CONSTRAINT IF EXISTS study_member_invites_role_check;

ALTER TABLE public.study_member_invites
  ADD CONSTRAINT study_member_invites_role_check
  CHECK (role IN ('member', 'reviewer', 'approver', 'auditor', 'admin', 'creator'));

-- ---------------------------------------------------------------------------
-- 3. New studies: seed member + reviewer + approver + auditor + admin (no creator)
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
    (NEW.id, 'member', 'Member', TRUE, 1,
      true, true, false, false, false,
      false, false, true,
      false, false, false),
    (NEW.id, 'reviewer', 'Reviewer', TRUE, 2,
      true, true, true, false, false,
      false, false, false,
      true, false, false),
    (NEW.id, 'approver', 'Approver', TRUE, 3,
      true, true, true, true, true,
      false, false, false,
      true, true, false),
    (NEW.id, 'auditor', 'Auditor', TRUE, 4,
      true, true, true, false, false,
      false, false, false,
      false, false, true),
    (NEW.id, 'admin', 'Admin', TRUE, 5,
      true, true, true, true, true,
      true, true, true,
      true, true, true)
  ON CONFLICT (study_id, slug) DO NOTHING;
  RETURN NEW;
END;
$$;
