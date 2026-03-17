-- Admin Delete, Notifications, and Study Audit Trail
-- Adds record_deleted audit action; RLS for record/study DELETE; notifications table

-- ============================================================================
-- 1. AUDIT EVENTS: Add record_deleted action type
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
    'record_draft_updated', 'record_deleted',
    'document_uploaded', 'document_deleted',
    'signature_added', 'signature_revoked',
    'identity_linked',
    'share_created', 'share_accessed',
    'ai_action', 'system_action',
    'blockchain_anchored'
  ));

-- ============================================================================
-- 2. HELPER: User is admin of study (admin role only, for delete operations)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.is_study_admin_role_only(p_study_id UUID, p_user_id UUID)
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
      AND role = 'admin'
      AND revoked_at IS NULL
  );
$$;

-- ============================================================================
-- 3. RLS: Admins can delete records (draft/rejected only enforced in API)
-- ============================================================================
CREATE POLICY "Admins can delete records"
  ON public.records FOR DELETE
  USING (public.is_study_admin_role_only(study_id, auth.uid()));

-- ============================================================================
-- 4. RLS: Admins can delete studies
-- ============================================================================
CREATE POLICY "Admins can delete studies"
  ON public.studies FOR DELETE
  USING (public.is_study_admin_role_only(id, auth.uid()));

-- ============================================================================
-- 5. NOTIFICATIONS TABLE
-- ============================================================================
CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_notifications_user_unread ON public.notifications(user_id) WHERE read_at IS NULL;
CREATE INDEX idx_notifications_user_created ON public.notifications(user_id, created_at DESC);

-- RLS: Users can SELECT and UPDATE only their own notifications
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own notifications"
  ON public.notifications FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can update own notifications"
  ON public.notifications FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- INSERT: Only service/backend can insert (no policy = no direct user insert; API uses service role or bypass)
-- For API inserts we'll use the regular client - we need a policy that allows insert when it's for another user?
-- Actually the delete study API will insert notifications. The API uses createClient() which is the user's session.
-- So when admin deletes study, the request is made as that admin. The insert would be for OTHER users (the members).
-- So we need a policy: user can insert notifications where user_id = auth.uid() (for self) OR... we need the API to use
-- a service role for inserting notifications. Let me check - the plan says "Insert notification for each member".
-- The admin is deleting. We're inserting for each member. So we need to insert with user_id = member_id. The auth.uid()
-- would be the admin. So we need either:
-- A) Policy: allow insert when auth.uid() is admin of some study - complex
-- B) Use createAdminClient (service role) in the delete API for notification inserts - bypasses RLS
-- C) Policy: allow any authenticated user to insert notifications (dangerous - users could spam others)
-- D) Create a DB function that inserts notifications, callable by SECURITY DEFINER, and the API calls it

-- Best: Use createAdminClient in the delete study API when inserting notifications. That bypasses RLS.
-- So we don't need an INSERT policy for users - the API uses admin client. We need to allow the backend to insert.
-- With no INSERT policy, only the database owner (postgres) or bypass can insert. Supabase service role bypasses RLS.
-- So we're good - the API will use createAdminClient (service role) to insert notifications.

COMMENT ON TABLE public.notifications IS 'In-app notifications for users (e.g. study deleted). Inserted by backend.';
