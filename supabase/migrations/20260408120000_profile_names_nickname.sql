-- Structured profile names + optional nickname for member-list display.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS first_name TEXT,
  ADD COLUMN IF NOT EXISTS last_name TEXT,
  ADD COLUMN IF NOT EXISTS nickname TEXT;

COMMENT ON COLUMN public.profiles.first_name IS 'Given name; required for completed account setup.';
COMMENT ON COLUMN public.profiles.last_name IS 'Family name; required for completed account setup.';
COMMENT ON COLUMN public.profiles.nickname IS 'Optional; when set, shown in member lists/dropdowns instead of First L.';

-- Best-effort backfill from legacy display_name when structured names are empty.
UPDATE public.profiles p
SET
  first_name = CASE
    WHEN trim(coalesce(p.display_name, '')) = '' THEN NULL
    WHEN position(' ' IN trim(p.display_name)) > 0
      THEN trim(split_part(trim(p.display_name), ' ', 1))
    ELSE trim(p.display_name)
  END,
  last_name = CASE
    WHEN trim(coalesce(p.display_name, '')) = '' THEN NULL
    WHEN position(' ' IN trim(p.display_name)) > 0
      THEN nullif(
        trim(substring(trim(p.display_name) from position(' ' IN trim(p.display_name)) + 1)),
        ''
      )
    ELSE NULL
  END
WHERE p.first_name IS NULL
  AND p.last_name IS NULL
  AND trim(coalesce(p.display_name, '')) <> '';
