-- Study-level workflow and security settings (admin-configurable)
-- required_approval_count: number of distinct approval signatures before record becomes approved

ALTER TABLE public.studies
  ADD COLUMN IF NOT EXISTS required_approval_count INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS require_review_before_approval BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS allow_creator_approval BOOLEAN NOT NULL DEFAULT false;

-- Ensure at least one approval required
ALTER TABLE public.studies
  DROP CONSTRAINT IF EXISTS studies_required_approval_count_min;
ALTER TABLE public.studies
  ADD CONSTRAINT studies_required_approval_count_min CHECK (required_approval_count >= 1);

COMMENT ON COLUMN public.studies.required_approval_count IS 'Number of distinct approver signatures (intent=approval) required before record status becomes approved';
COMMENT ON COLUMN public.studies.require_review_before_approval IS 'When true, record should be in under_review before approval is allowed';
COMMENT ON COLUMN public.studies.allow_creator_approval IS 'When true, study creator may also act as approver (in addition to approver role)';
