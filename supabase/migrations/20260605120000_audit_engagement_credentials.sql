-- Auditor identity / attestation fields on audit engagements (immutable after accept in app logic).
-- Optional institution metadata key auditor_reference_id_format for format validation.

ALTER TABLE public.audit_engagements
  ADD COLUMN IF NOT EXISTS auditor_organization_name TEXT,
  ADD COLUMN IF NOT EXISTS auditor_title TEXT,
  ADD COLUMN IF NOT EXISTS auditor_reference_id TEXT,
  ADD COLUMN IF NOT EXISTS attested_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS attestation_text_hash TEXT;

COMMENT ON COLUMN public.audit_engagements.auditor_organization_name IS
  'Audit firm / employer attested at accept. Set once with accepted_at; not updated afterward.';
COMMENT ON COLUMN public.audit_engagements.auditor_title IS
  'Optional auditor role/title attested at accept.';
COMMENT ON COLUMN public.audit_engagements.auditor_reference_id IS
  'Optional engagement or firm reference ID attested at accept. May be validated against institution metadata.auditor_reference_id_format.';
COMMENT ON COLUMN public.audit_engagements.attested_at IS
  'When the auditor attested credentials (same transaction as accept).';
COMMENT ON COLUMN public.audit_engagements.attestation_text_hash IS
  'Hash of the attestation statement text (not the raw secrets).';

ALTER TABLE public.audit_engagements
  DROP CONSTRAINT IF EXISTS audit_engagements_org_name_length;
ALTER TABLE public.audit_engagements
  ADD CONSTRAINT audit_engagements_org_name_length
  CHECK (auditor_organization_name IS NULL OR char_length(auditor_organization_name) BETWEEN 1 AND 200);

ALTER TABLE public.audit_engagements
  DROP CONSTRAINT IF EXISTS audit_engagements_title_length;
ALTER TABLE public.audit_engagements
  ADD CONSTRAINT audit_engagements_title_length
  CHECK (auditor_title IS NULL OR char_length(auditor_title) BETWEEN 1 AND 120);

ALTER TABLE public.audit_engagements
  DROP CONSTRAINT IF EXISTS audit_engagements_reference_id_length;
ALTER TABLE public.audit_engagements
  ADD CONSTRAINT audit_engagements_reference_id_length
  CHECK (auditor_reference_id IS NULL OR char_length(auditor_reference_id) BETWEEN 1 AND 120);
