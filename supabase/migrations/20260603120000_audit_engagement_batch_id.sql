-- Optional batch_id groups auditors issued together in one admin action.

ALTER TABLE public.audit_engagements
  ADD COLUMN IF NOT EXISTS batch_id UUID;

CREATE INDEX IF NOT EXISTS idx_audit_engagements_batch_id
  ON public.audit_engagements(batch_id)
  WHERE batch_id IS NOT NULL;

COMMENT ON COLUMN public.audit_engagements.batch_id IS
  'Optional UUID shared by engagements created in one multi-auditor issuance.';
