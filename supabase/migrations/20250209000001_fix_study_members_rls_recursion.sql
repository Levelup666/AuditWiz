-- Fix infinite recursion in study_members RLS policies
-- Root cause: policies on study_members queried study_members, re-triggering RLS.
-- Solution: SECURITY DEFINER helpers that read study_members without triggering RLS.

-- Helper: true if user is an active member of the study (bypasses RLS when used in policies)
CREATE OR REPLACE FUNCTION public.is_study_member(p_study_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.study_members
    WHERE study_id = p_study_id
      AND user_id = p_user_id
      AND revoked_at IS NULL
  );
$$;

-- Helper: true if user is an active admin (or creator) of the study
CREATE OR REPLACE FUNCTION public.is_study_admin(p_study_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.study_members
    WHERE study_id = p_study_id
      AND user_id = p_user_id
      AND role IN ('admin', 'creator')
      AND revoked_at IS NULL
  );
$$;

-- Drop the self-referential policies that cause recursion
DROP POLICY IF EXISTS "Users can view study members" ON public.study_members;
DROP POLICY IF EXISTS "Admins can manage study members" ON public.study_members;

-- Recreate SELECT using helper (no direct query on study_members)
CREATE POLICY "Users can view study members"
  ON public.study_members FOR SELECT
  USING (public.is_study_member(study_id, auth.uid()));

-- Admins can update/delete members only (INSERT is handled by "Study creator can add self as admin member")
CREATE POLICY "Admins can update study members"
  ON public.study_members FOR UPDATE
  USING (public.is_study_admin(study_id, auth.uid()));

CREATE POLICY "Admins can delete study members"
  ON public.study_members FOR DELETE
  USING (public.is_study_admin(study_id, auth.uid()));

COMMENT ON FUNCTION public.is_study_member(UUID, UUID) IS 'RLS-safe: returns whether user is an active member of the study. Used in policies to avoid recursion.';
COMMENT ON FUNCTION public.is_study_admin(UUID, UUID) IS 'RLS-safe: returns whether user is an active admin/creator of the study. Used in policies to avoid recursion.';
