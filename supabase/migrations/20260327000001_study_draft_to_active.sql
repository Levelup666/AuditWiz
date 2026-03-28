-- Align legacy draft studies with new lifecycle: new studies default to active.
UPDATE public.studies
SET status = 'active'
WHERE status = 'draft';
