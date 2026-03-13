-- Draft Records: Allow saving draft content with full audit attribution
-- Adds last_edited_at, last_edited_by; RLS for draft updates; record_draft_updated audit action

-- ============================================================================
-- 1. RECORDS: Add draft-specific columns
-- ============================================================================
ALTER TABLE public.records
  ADD COLUMN IF NOT EXISTS last_edited_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_edited_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.records.last_edited_at IS 'When draft was last saved; NULL when never edited or not draft';
COMMENT ON COLUMN public.records.last_edited_by IS 'User who last saved draft; NULL when never edited or not draft';

-- ============================================================================
-- 2. AUDIT EVENTS: Add record_draft_updated action type
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
    'record_draft_updated',
    'document_uploaded', 'document_deleted',
    'signature_added', 'signature_revoked',
    'identity_linked',
    'share_created', 'share_accessed',
    'ai_action', 'system_action',
    'blockchain_anchored'
  ));

-- ============================================================================
-- 3. TRIGGER: Update audit_record_change for draft updates
-- ============================================================================
CREATE OR REPLACE FUNCTION public.audit_record_change()
RETURNS TRIGGER AS $$
DECLARE
  v_previous_hash TEXT;
  v_new_hash TEXT;
  v_action_type TEXT;
  v_actor_id UUID;
BEGIN
  v_new_hash := NEW.content_hash;
  
  IF TG_OP = 'INSERT' THEN
    v_action_type := 'record_created';
    v_previous_hash := NULL;
    v_actor_id := NEW.created_by;
  ELSIF TG_OP = 'UPDATE' THEN
    -- Status-only changes: handled by API (record_submitted, record_rejected)
    IF OLD.content_hash = NEW.content_hash AND OLD.content IS NOT DISTINCT FROM NEW.content THEN
      RETURN NEW;
    END IF;
    -- Amendment: version changed
    IF NEW.version > OLD.version THEN
      v_action_type := 'record_amended';
      v_previous_hash := OLD.content_hash;
      v_actor_id := NEW.created_by;
    -- Draft content update: same version, status = draft
    ELSIF NEW.status = 'draft' AND NEW.version = OLD.version THEN
      v_action_type := 'record_draft_updated';
      v_previous_hash := OLD.content_hash;
      v_actor_id := COALESCE(NEW.last_edited_by, NEW.created_by);
    ELSE
      RETURN NEW;
    END IF;
  END IF;
  
  -- Create audit event
  PERFORM public.create_audit_event(
    NEW.study_id,
    v_actor_id,
    v_action_type,
    'record',
    NEW.id,
    v_previous_hash,
    v_new_hash,
    jsonb_build_object(
      'record_number', NEW.record_number,
      'version', NEW.version,
      'status', NEW.status,
      'amendment_reason', NEW.amendment_reason,
      'last_edited_at', NEW.last_edited_at,
      'last_edited_by', NEW.last_edited_by
    )
  );
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 4. RLS: Allow creators to update draft records (content) and submit them
-- ============================================================================
-- Drop existing policy that only allowed reviewers/approvers (creators need to submit)
DROP POLICY IF EXISTS "Reviewers and approvers can update record status" ON public.records;

-- Creators/admins: update draft content OR submit draft (draft -> submitted/under_review)
CREATE POLICY "Creators can update draft records"
  ON public.records FOR UPDATE
  USING (
    status = 'draft'
    AND EXISTS (
      SELECT 1 FROM public.study_members
      WHERE study_id = records.study_id
        AND user_id = auth.uid()
        AND role IN ('creator', 'admin')
        AND revoked_at IS NULL
    )
  )
  WITH CHECK (
    status = 'draft'  -- content update
    OR status IN ('submitted', 'under_review')  -- submit for review
  );

-- Reviewers/approvers: reject or other status transitions (existing behavior)
CREATE POLICY "Reviewers and approvers can update record status"
  ON public.records FOR UPDATE
  USING (
    status IN ('submitted', 'under_review')
    AND EXISTS (
      SELECT 1 FROM public.study_members
      WHERE study_id = records.study_id
        AND user_id = auth.uid()
        AND role IN ('reviewer', 'approver', 'admin')
        AND revoked_at IS NULL
    )
  )
  WITH CHECK (status IN ('submitted', 'under_review', 'rejected', 'approved', 'amended'));
