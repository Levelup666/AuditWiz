-- Study Documentation: Optional Markdown documentation per study

ALTER TABLE public.studies
  ADD COLUMN IF NOT EXISTS documentation TEXT;

COMMENT ON COLUMN public.studies.documentation IS 'Study-level documentation (protocol, SOPs). Markdown supported.';
