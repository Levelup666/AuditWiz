-- Invite token hashes, revocation, first-open tracking; unified invite audit action types

-- ---------------------------------------------------------------------------
-- 1. Columns on invite tables
-- ---------------------------------------------------------------------------
ALTER TABLE public.study_member_invites
  ADD COLUMN IF NOT EXISTS token_hash TEXT,
  ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS invite_first_opened_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS expiry_audit_logged_at TIMESTAMPTZ;

ALTER TABLE public.institution_invites
  ADD COLUMN IF NOT EXISTS token_hash TEXT,
  ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS invite_first_opened_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS expiry_audit_logged_at TIMESTAMPTZ;

-- Backfill: legacy rows get opaque hashes (email links for those rows are not recoverable; in-app id flows still work)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Use extensions.digest (pgcrypto); algorithm must be text not unknown. Fallback: public.digest if search_path differs.
UPDATE public.study_member_invites
SET token_hash = encode(
  extensions.digest(
    convert_to(gen_random_uuid()::text || gen_random_uuid()::text, 'UTF8'),
    'sha256'::text
  ),
  'hex'
)
WHERE token_hash IS NULL;

UPDATE public.institution_invites
SET token_hash = encode(
  extensions.digest(
    convert_to(gen_random_uuid()::text || gen_random_uuid()::text, 'UTF8'),
    'sha256'::text
  ),
  'hex'
)
WHERE token_hash IS NULL;

ALTER TABLE public.study_member_invites
  ALTER COLUMN token_hash SET NOT NULL;

ALTER TABLE public.institution_invites
  ALTER COLUMN token_hash SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_study_member_invites_token_hash
  ON public.study_member_invites(token_hash);

CREATE UNIQUE INDEX IF NOT EXISTS idx_institution_invites_token_hash
  ON public.institution_invites(token_hash);

COMMENT ON COLUMN public.study_member_invites.token_hash IS 'SHA-256 hex of secret invite token; raw token never stored.';
COMMENT ON COLUMN public.institution_invites.token_hash IS 'SHA-256 hex of secret invite token; raw token never stored.';

-- ---------------------------------------------------------------------------
-- 2. Audit: invite_* action types
-- ---------------------------------------------------------------------------
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
    'record_created', 'record_submitted', 'record_amended', 'record_rejected', 'record_approved',
    'record_draft_updated', 'record_deleted',
    'document_uploaded', 'document_deleted',
    'signature_added', 'signature_revoked',
    'identity_linked',
    'share_created', 'share_accessed',
    'ai_action', 'system_action',
    'blockchain_anchored',
    'invite_created', 'invite_opened', 'invite_accepted', 'invite_rejected', 'invite_expired'
  ));
