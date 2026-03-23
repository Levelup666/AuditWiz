-- One-off backfill: studies with NULL institution_id (pre–institution-scoping data)
-- Creates one "Legacy (migrated studies)" institution per distinct study creator,
-- grants that user institution admin, then sets studies.institution_id.
-- Idempotent: safe to re-run (skips existing legacy-* slugs; only updates rows still NULL).

-- ============================================================================
-- 1. Legacy institution per creator who has orphaned studies
-- ============================================================================
INSERT INTO public.institutions (name, slug, description, metadata, created_by)
SELECT
  'Legacy (migrated studies)',
  'legacy-migrated-' || replace(sb.created_by::text, '-', ''),
  'Auto-created to attach studies that existed before institution scoping. You can rename or move studies later.',
  jsonb_build_object(
    'migrated_legacy', true,
    'allow_external_collaborators', true
  ),
  sb.created_by
FROM (SELECT DISTINCT created_by FROM public.studies WHERE institution_id IS NULL) AS sb(created_by)
WHERE NOT EXISTS (
  SELECT 1
  FROM public.institutions i
  WHERE i.slug = 'legacy-migrated-' || replace(sb.created_by::text, '-', '')
);

-- ============================================================================
-- 2. Creator is institution admin (self-granted for migration)
-- ============================================================================
INSERT INTO public.institution_members (institution_id, user_id, role, granted_by)
SELECT i.id, i.created_by, 'admin', i.created_by
FROM public.institutions i
WHERE COALESCE((i.metadata->>'migrated_legacy')::boolean, false) = true
  AND i.slug LIKE 'legacy-migrated-%'
ON CONFLICT (institution_id, user_id) DO NOTHING;

-- ============================================================================
-- 3. Attach orphaned studies
-- ============================================================================
UPDATE public.studies s
SET institution_id = i.id,
    updated_at = NOW()
FROM public.institutions i
WHERE s.institution_id IS NULL
  AND i.slug = 'legacy-migrated-' || replace(s.created_by::text, '-', '');

COMMENT ON TABLE public.institutions IS 'Top-level organizational unit. Studies belong to institutions. Rows with metadata.migrated_legacy and slug legacy-migrated-* were created by backfill 20250322000001.';
