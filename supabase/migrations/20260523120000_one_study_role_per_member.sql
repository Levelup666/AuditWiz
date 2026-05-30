-- One active role assignment per user per study (custom roles replace multi-role stacking).

-- ---------------------------------------------------------------------------
-- 1. Consolidate duplicate active assignments (keep highest sort_order)
-- ---------------------------------------------------------------------------
WITH ranked AS (
  SELECT a.id,
    ROW_NUMBER() OVER (
      PARTITION BY a.study_id, a.user_id
      ORDER BY d.sort_order DESC, a.granted_at DESC
    ) AS rn
  FROM public.study_member_role_assignments a
  JOIN public.study_role_definitions d ON d.id = a.role_definition_id
  WHERE a.revoked_at IS NULL
)
UPDATE public.study_member_role_assignments a
SET revoked_at = now()
FROM ranked r
WHERE a.id = r.id AND r.rn > 1;

-- ---------------------------------------------------------------------------
-- 2. Consolidate duplicate active study_members rows (keep highest sort_order)
-- ---------------------------------------------------------------------------
WITH ranked AS (
  SELECT sm.id,
    ROW_NUMBER() OVER (
      PARTITION BY sm.study_id, sm.user_id
      ORDER BY COALESCE(d.sort_order, 0) DESC, sm.granted_at DESC
    ) AS rn
  FROM public.study_members sm
  LEFT JOIN public.study_role_definitions d ON d.id = sm.role_definition_id
  WHERE sm.revoked_at IS NULL
)
UPDATE public.study_members sm
SET revoked_at = now()
FROM ranked r
WHERE sm.id = r.id AND r.rn > 1;

-- ---------------------------------------------------------------------------
-- 3. Enforce one active assignment per (study, user)
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_study_role_assignments_max_two ON public.study_member_role_assignments;
DROP FUNCTION IF EXISTS public.enforce_max_two_study_role_assignments();

CREATE OR REPLACE FUNCTION public.enforce_one_study_role_per_user()
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
    IF cnt >= 1 THEN
      RAISE EXCEPTION 'User already has an active role on this study';
    END IF;
  ELSIF TG_OP = 'UPDATE' AND NEW.revoked_at IS NULL AND (OLD.revoked_at IS NOT NULL) THEN
    SELECT COUNT(*) INTO cnt
    FROM public.study_member_role_assignments
    WHERE study_id = NEW.study_id
      AND user_id = NEW.user_id
      AND revoked_at IS NULL
      AND id <> NEW.id;
    IF cnt >= 1 THEN
      RAISE EXCEPTION 'User already has an active role on this study';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_study_role_assignments_one_per_user
  BEFORE INSERT OR UPDATE ON public.study_member_role_assignments
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_one_study_role_per_user();

DROP INDEX IF EXISTS study_members_active_study_user_role_def;

CREATE UNIQUE INDEX IF NOT EXISTS study_members_one_active_per_user
  ON public.study_members (study_id, user_id)
  WHERE revoked_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS study_member_role_assignments_one_active_per_user
  ON public.study_member_role_assignments (study_id, user_id)
  WHERE revoked_at IS NULL;

-- ---------------------------------------------------------------------------
-- 4. Sync assignment -> study_members (one row per user; support role changes)
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
    IF EXISTS (
      SELECT 1 FROM public.study_members
      WHERE study_id = NEW.study_id
        AND user_id = NEW.user_id
        AND revoked_at IS NULL
    ) THEN
      UPDATE public.study_members
      SET
        role = def.slug,
        role_definition_id = NEW.role_definition_id,
        granted_by = COALESCE(NEW.granted_by, granted_by),
        granted_at = NEW.granted_at,
        can_view = def.can_view,
        can_comment = def.can_comment,
        can_review = def.can_review,
        can_approve = def.can_approve,
        can_share = def.can_share
      WHERE study_id = NEW.study_id
        AND user_id = NEW.user_id
        AND revoked_at IS NULL;
    ELSE
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
      AND revoked_at IS NULL;
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE'
    AND NEW.revoked_at IS NULL
    AND OLD.revoked_at IS NULL
    AND NEW.role_definition_id IS DISTINCT FROM OLD.role_definition_id
  THEN
    SELECT * INTO def FROM public.study_role_definitions WHERE id = NEW.role_definition_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Role definition not found';
    END IF;
    UPDATE public.study_members
    SET
      role = def.slug,
      role_definition_id = NEW.role_definition_id,
      can_view = def.can_view,
      can_comment = def.can_comment,
      can_review = def.can_review,
      can_approve = def.can_approve,
      can_share = def.can_share
    WHERE study_id = NEW.study_id
      AND user_id = NEW.user_id
      AND revoked_at IS NULL;
    RETURN NEW;
  END IF;
  RETURN NEW;
END;
$$;
