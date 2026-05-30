-- Password policy + rotation preferences on profiles.
-- Ops: Supabase Dashboard → Auth → set minimum password length to 12 and enable leaked-password protection.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS password_policy_legacy boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS password_rotation_days smallint
    CHECK (password_rotation_days IS NULL OR password_rotation_days IN (30, 60, 90)),
  ADD COLUMN IF NOT EXISTS password_last_changed_at timestamptz;

COMMENT ON COLUMN public.profiles.password_policy_legacy IS
  'When true, user is exempt from mandatory rotation and setup rotation choice; existing password unchanged until voluntary update.';
COMMENT ON COLUMN public.profiles.password_rotation_days IS
  'User-chosen password rotation interval (30, 60, or 90 days) for non-legacy email/password accounts.';
COMMENT ON COLUMN public.profiles.password_last_changed_at IS
  'Last successful password change; used with password_rotation_days for expiry gate.';

-- Grandfather users who already completed account setup before this migration.
UPDATE public.profiles
SET password_policy_legacy = true
WHERE account_setup_completed_at IS NOT NULL;
