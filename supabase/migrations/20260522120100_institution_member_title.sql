-- Optional display title for institution members (org directory).

ALTER TABLE public.institution_members
  ADD COLUMN IF NOT EXISTS title TEXT NULL;

ALTER TABLE public.institution_members
  DROP CONSTRAINT IF EXISTS institution_members_title_length;

ALTER TABLE public.institution_members
  ADD CONSTRAINT institution_members_title_length
  CHECK (
    title IS NULL
    OR (
      char_length(trim(title)) >= 1
      AND char_length(title) <= 120
    )
  );

COMMENT ON COLUMN public.institution_members.title IS
  'Optional job/role title set by institution admins; shown under member name in UI.';

-- Audit: institution member title updates
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
    'institution_member_title_updated',
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
    'audit_engagement_accessed', 'audit_engagement_export',
    'password_changed', 'password_rotation_preference_updated'
  ));
