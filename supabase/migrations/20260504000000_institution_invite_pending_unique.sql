-- Institution pending invites: resend metadata, dedupe before unique index, partial unique, audit types.

-- 1) Revoke duplicate open invites per (institution, normalized email), keeping the newest by invited_at.
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY institution_id, lower(trim(email))
      ORDER BY invited_at DESC
    ) AS rn
  FROM public.institution_invites
  WHERE accepted_at IS NULL
    AND revoked_at IS NULL
    AND email IS NOT NULL
    AND trim(email) <> ''
)
UPDATE public.institution_invites i
SET revoked_at = now()
FROM ranked r
WHERE i.id = r.id
  AND r.rn > 1;

-- 2) Columns for resend UX
ALTER TABLE public.institution_invites
  ADD COLUMN IF NOT EXISTS last_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS resend_count INTEGER NOT NULL DEFAULT 0;

UPDATE public.institution_invites
SET last_sent_at = invited_at
WHERE last_sent_at IS NULL;

COMMENT ON COLUMN public.institution_invites.last_sent_at IS 'When the latest invite email was sent (create or resend).';
COMMENT ON COLUMN public.institution_invites.resend_count IS 'Number of times the invite was resent after the initial send.';

-- 3) At most one open (pending) institution invite per institution and email (case-insensitive, trimmed).
CREATE UNIQUE INDEX IF NOT EXISTS idx_institution_invites_open_institution_lower_email
  ON public.institution_invites (institution_id, lower(trim(email)))
  WHERE accepted_at IS NULL
    AND revoked_at IS NULL
    AND email IS NOT NULL;

COMMENT ON INDEX public.idx_institution_invites_open_institution_lower_email IS
  'Prevents duplicate pending email invites to the same institution.';

-- 4) Audit: admin resend / revoke of pending invites
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
    'invite_created', 'invite_opened', 'invite_accepted', 'invite_rejected', 'invite_expired',
    'invite_resent', 'invite_revoked',
    'study_task_created', 'study_task_updated', 'study_task_cancelled', 'study_task_completed'
  ));
