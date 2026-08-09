-- Phase 4: engagement letter artifact + COI declaration fields on audit_engagements.

ALTER TABLE public.audit_engagements
  ADD COLUMN IF NOT EXISTS engagement_letter_file_name TEXT,
  ADD COLUMN IF NOT EXISTS engagement_letter_file_path TEXT,
  ADD COLUMN IF NOT EXISTS engagement_letter_file_hash TEXT,
  ADD COLUMN IF NOT EXISTS engagement_letter_file_size BIGINT,
  ADD COLUMN IF NOT EXISTS engagement_letter_mime_type TEXT,
  ADD COLUMN IF NOT EXISTS engagement_letter_uploaded_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS coi_declared_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS coi_statement_hash TEXT,
  ADD COLUMN IF NOT EXISTS coi_has_conflict BOOLEAN,
  ADD COLUMN IF NOT EXISTS coi_disclosure TEXT;

COMMENT ON COLUMN public.audit_engagements.engagement_letter_file_path IS
  'Storage path for optional engagement letter / scope PDF uploaded at or after issuance. Immutable once set (no replacement).';
COMMENT ON COLUMN public.audit_engagements.engagement_letter_file_hash IS
  'SHA-256 hex of engagement letter bytes.';
COMMENT ON COLUMN public.audit_engagements.coi_declared_at IS
  'When the auditor completed conflict-of-interest declaration at accept.';
COMMENT ON COLUMN public.audit_engagements.coi_statement_hash IS
  'Hash of COI attestation statement + disclosure payload (not a secret store).';
COMMENT ON COLUMN public.audit_engagements.coi_has_conflict IS
  'True when auditor disclosed a potential conflict at accept.';
COMMENT ON COLUMN public.audit_engagements.coi_disclosure IS
  'Optional conflict disclosure text when coi_has_conflict is true. Set once at accept.';

ALTER TABLE public.audit_engagements
  DROP CONSTRAINT IF EXISTS audit_engagements_letter_hash_format;
ALTER TABLE public.audit_engagements
  ADD CONSTRAINT audit_engagements_letter_hash_format
  CHECK (
    engagement_letter_file_hash IS NULL
    OR engagement_letter_file_hash ~ '^[0-9a-f]{64}$'
  );

ALTER TABLE public.audit_engagements
  DROP CONSTRAINT IF EXISTS audit_engagements_letter_size_positive;
ALTER TABLE public.audit_engagements
  ADD CONSTRAINT audit_engagements_letter_size_positive
  CHECK (
    engagement_letter_file_size IS NULL
    OR engagement_letter_file_size > 0
  );

ALTER TABLE public.audit_engagements
  DROP CONSTRAINT IF EXISTS audit_engagements_coi_disclosure_length;
ALTER TABLE public.audit_engagements
  ADD CONSTRAINT audit_engagements_coi_disclosure_length
  CHECK (
    coi_disclosure IS NULL
    OR char_length(coi_disclosure) BETWEEN 1 AND 2000
  );

-- Letter and COI metadata are part of the engagement row; existing SELECT policies cover them.

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
    'audit_engagement_letter_uploaded',
    'password_changed', 'password_rotation_preference_updated'
  ));
